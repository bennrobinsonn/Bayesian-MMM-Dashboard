"""
api/services/inference.py
-------------------------
Extracts posterior quantities from ArviZ InferenceData objects.

This is the most Bayesian-concepts-dense file in the project. Every function
here operates on *distributions*, not point estimates. The outputs are means and
HDI intervals — never single numbers without uncertainty attached.

HDI = Highest Density Interval
    The narrowest interval containing X% of posterior probability mass.
    "There is 94% probability the true value lies in [low, high]."
    This is a direct probability statement about the parameter — not about
    the procedure that produced the interval (which is what frequentist
    confidence intervals say).

HDI_PROB = 0.94
    ArviZ convention. Avoids implying the false precision of 95%, which is
    a frequentist threshold with no special meaning in Bayesian inference.

Posterior sample shape (from MCMC):
    (chains, draws, ...) — e.g. (2, 1000, n_obs, n_channels)
    We always flatten chains × draws → n_samples before doing math.
    Flattening is valid because NUTS ensures each chain independently
    explores the same posterior; concatenating them gives more samples.
"""

import numpy as np
import pandas as pd
import arviz as az

HDI_PROB = 0.94  # 94% credible interval — ArviZ default


# ── Internal helpers ───────────────────────────────────────────────────────────

def _to_samples(da) -> np.ndarray:
    """
    Flattens a (chain, draw, ...) xarray DataArray to (n_samples, ...) numpy array.

    Example: (2, 1000, 200, 4) → (2000, 200, 4)
    The first two dims are always (chain, draw) in ArviZ convention.
    """
    v = da.values
    n_chains, n_draws = v.shape[0], v.shape[1]
    return v.reshape(n_chains * n_draws, *v.shape[2:])


def _hdi(samples_1d: np.ndarray) -> tuple[float, float]:
    """
    Returns (low, high) 94% HDI for a 1D array of posterior samples.
    az.hdi() returns a numpy array [low, high].
    """
    result = az.hdi(samples_1d, hdi_prob=HDI_PROB)
    return float(result[0]), float(result[1])


# ── Channel contributions ──────────────────────────────────────────────────────

def get_channel_contributions(
    idata: az.InferenceData,
    channels: list[str],
    spend_totals: dict[str, float],
) -> list[dict]:
    """
    Returns channel attribution % and ROAS, both with 94% HDI credible intervals.

    What 'channel_contribution' is:
        PyMC-Marketing stores a deterministic variable called channel_contribution
        in the posterior. Shape: (chain, draw, n_obs, n_channels).
        Each element is the model's estimate of how many revenue dollars that
        channel produced in that week under that particular draw.

        Because there are 2,000 draws (2 chains × 1,000), we have 2,000 complete,
        plausible versions of "what actually happened" — the full posterior.

    What we do with it:
        1. Sum over weeks → total contribution per channel per draw (2000, n_channels)
        2. Divide by grand total → contribution % per draw
        3. Mean of that distribution = point estimate
        4. HDI of that distribution = credible interval

    ROAS:
        Total channel contribution $$ (a distribution) / total channel spend $$
        (a fixed number — spend is observed data, not a parameter).
        Result is a distribution of ROAS values with its own HDI.

    Args:
        spend_totals: {channel_name: sum of all weekly spend $$}
                      Used as the denominator in ROAS. Loaded from the CSV by
                      the route — inference.py doesn't touch the filesystem.
    """
    # Use _original_scale variant — values are in actual revenue dollars,
    # which is what we need for ROAS (contribution $$ / spend $$).
    # The non-scaled "channel_contribution" is in the model's normalized space.
    contrib_da = idata.posterior["channel_contribution_original_scale"]
    dims       = list(contrib_da.dims)
    obs_dim    = dims[2]   # name of the time/obs axis ("date")
    ch_dim     = dims[3]   # name of the channel axis ("channel")

    # Sum over time → (chain, draw, channel)
    ch_totals    = contrib_da.sum(dim=obs_dim)
    grand_total  = ch_totals.sum(dim=ch_dim)              # (chain, draw)
    contrib_pct  = (ch_totals / grand_total) * 100.0      # (chain, draw, channel)

    # Flatten chains × draws → (n_samples, n_channels)
    pct_samples    = _to_samples(contrib_pct)    # (2000, n_channels)
    dollar_samples = _to_samples(ch_totals)      # (2000, n_channels)

    results = []
    for i, ch in enumerate(channels):
        pct_s    = pct_samples[:, i]     # 2000 samples of this channel's %
        dollar_s = dollar_samples[:, i]  # 2000 samples of this channel's $$ contribution

        pct_low, pct_high = _hdi(pct_s)

        # ROAS: spend is a fixed scalar (from the data), contribution is a distribution
        # → ROAS inherits all uncertainty from the contribution posterior
        total_spend  = max(spend_totals.get(ch, 1.0), 1e-9)  # guard against zero spend
        roas_samples = dollar_s / total_spend
        roas_low, roas_high = _hdi(roas_samples)

        results.append({
            "channel":               ch,
            # Point estimate: posterior mean contribution share
            "contribution_pct":      round(float(np.mean(pct_s)), 2),
            # HDI: "94% probability TV's true share is between these values"
            "contribution_hdi_low":  round(pct_low, 2),
            "contribution_hdi_high": round(pct_high, 2),
            # ROAS with uncertainty — the interval is wide when the model is uncertain
            "roas_mean":             round(float(np.mean(roas_samples)), 3),
            "roas_hdi_low":          round(roas_low, 3),
            "roas_hdi_high":         round(roas_high, 3),
        })

    return results


# ── Saturation curves ──────────────────────────────────────────────────────────

def get_saturation_curves(
    idata: az.InferenceData,
    channels: list[str],
    spend_maxes: dict[str, float],
    n_points: int = 50,
) -> dict[str, list[dict]]:
    """
    Returns saturation curve points per channel for the frontend line chart.

    PyMC-Marketing LogisticSaturation formula:
        contribution(x) = saturation_beta × sigmoid(saturation_lam × x_norm)
        where x_norm = x_dollars / max_observed_spend
        and   sigmoid(z) = 1 / (1 + exp(−z))

    Why this shape matters:
        - At low spend, the curve is steep — each additional dollar has high marginal return.
        - At high spend, the curve flattens — diminishing returns have set in.
        - The inflection point (steepest slope) is the "sweet spot."

        A channel near the flat top of its curve is saturated — reallocating
        that budget elsewhere would improve total ROAS. A channel still on the
        steep part has room to grow. This is the core of the budget simulator.

    We return both a mean curve AND an HDI band at every x-point. The band
    shows uncertainty about the shape of the curve itself, not just where the
    brand currently sits on it.

    Args:
        spend_maxes: {channel: max observed weekly spend $$}
                     Sets the x-axis scale. We evaluate from $0 to 1.5× max
                     so users can see what happens if they increase beyond history.
        n_points:    resolution of the curve (50 gives a smooth plot)
    """
    # saturation_lam  (chain, draw, channel) — controls how quickly curve bends
    # saturation_beta (chain, draw, channel) — scales the contribution height
    try:
        lam_samples  = _to_samples(idata.posterior["saturation_lam"])   # (2000, n_ch)
        beta_samples = _to_samples(idata.posterior["saturation_beta"])  # (2000, n_ch)
    except KeyError as e:
        raise KeyError(
            f"Expected saturation parameter {e} in posterior. "
            "Ensure the model was fit with LogisticSaturation() and the "
            "InferenceData was saved after fitting."
        ) from e

    curves: dict[str, list[dict]] = {}

    for i, ch in enumerate(channels):
        max_spend = max(spend_maxes.get(ch, 1.0), 1e-9)

        # x-axis: $0 → 1.5× max observed weekly spend
        x_dollars = np.linspace(0.0, max_spend * 1.5, n_points)
        x_norm    = x_dollars / max_spend  # normalized [0, 1.5]

        ch_lam  = lam_samples[:, i]   # (2000,)
        ch_beta = beta_samples[:, i]  # (2000,)

        # Evaluate sigmoid(lam × x) for all x-points AND all posterior samples.
        # np.outer(x_norm, ch_lam) → (n_points, 2000): each row is one x-value
        # evaluated at all 2000 (lam, beta) posterior draws.
        lam_x          = np.outer(x_norm, ch_lam)              # (n_points, 2000)
        saturation_val = 1.0 / (1.0 + np.exp(-lam_x))          # sigmoid, (n_points, 2000)
        curve_samples  = saturation_val * ch_beta[np.newaxis, :] # scale by beta, (n_points, 2000)

        # az.hdi expects (n_samples, n_vars) → transpose to (2000, n_points)
        curve_hdi = az.hdi(curve_samples.T, hdi_prob=HDI_PROB)  # (n_points, 2)

        curve_points = [
            {
                "spend":             round(float(x_dollars[j]), 2),
                "contribution_mean": round(float(np.mean(curve_samples[j])), 6),
                "hdi_low":           round(float(curve_hdi[j, 0]), 6),
                "hdi_high":          round(float(curve_hdi[j, 1]), 6),
            }
            for j in range(n_points)
        ]

        curves[ch] = curve_points

    return curves


# ── Model fit statistics ───────────────────────────────────────────────────────

def get_model_fit(idata: az.InferenceData, observed_revenue: np.ndarray) -> dict:
    """
    Returns R² and RMSE using the posterior mean prediction vs observed Revenue.

    observed_revenue is passed in from the route (loaded from the brand CSV)
    because PyMC-Marketing saves a flat posterior Dataset — there is no
    separate observed_data group in the .nc file.

    Uses y_original_scale (posterior predicted revenue in original units) as
    the model's prediction. This is the full posterior predictive distribution;
    we take its mean as the point estimate for R² / RMSE.

    Important Bayesian caveat for your video:
        A Bayesian model doesn't have a single fit — every MCMC draw is a
        complete, plausible model. R² here uses the posterior mean prediction
        as a summary. It tells you whether the model tracks the data, not
        whether any single parameter is "correct."
    """
    # y_original_scale: (chain, draw, date) — model's predicted revenue per draw
    predicted = idata.posterior["y_original_scale"].mean(dim=["chain", "draw"]).values

    ss_res    = float(np.sum((observed_revenue - predicted) ** 2))
    ss_tot    = float(np.sum((observed_revenue - np.mean(observed_revenue)) ** 2))
    r_squared = 1.0 - ss_res / ss_tot
    rmse      = float(np.sqrt(np.mean((observed_revenue - predicted) ** 2)))

    return {
        "r_squared": round(r_squared, 4),
        "rmse":      round(rmse, 2),
        "n_obs":     int(len(observed_revenue)),
    }


# ── Spend helpers (used by routes to build spend_totals / spend_maxes) ─────────

def spend_stats_from_df(df: pd.DataFrame, channels: list[str]) -> tuple[dict, dict]:
    """
    Computes spend_totals and spend_maxes from a brand's dataset CSV.

    Routes call this once per request and pass the results into
    get_channel_contributions() and get_saturation_curves().

    Returns:
        spend_totals: {channel: sum of all weekly spend over the dataset}
        spend_maxes:  {channel: max observed weekly spend}
    """
    spend_totals = {ch: float(df[ch].sum()) for ch in channels}
    spend_maxes  = {ch: float(df[ch].max()) for ch in channels}
    return spend_totals, spend_maxes
