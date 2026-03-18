"""
api/routes/simulator.py
-----------------------
Budget reallocation what-if simulator.

POST /simulator/predict
    → given a proposed channel spend allocation, returns predicted weekly
      revenue with HDI credible intervals and delta vs. current allocation.

How the prediction works:
    The simulator re-evaluates the LogisticSaturation function at the proposed
    spend levels using the full posterior distribution of saturation parameters
    (lam, beta). For each of the 2,000 posterior draws, we compute what weekly
    revenue would be at the new spend levels — giving us a distribution of
    predicted revenues rather than a single number.

    This is a steady-state approximation: we estimate the average weekly
    contribution at a given spend level, not a week-by-week time series.
    Adstock dynamics (carry-over effects) are captured in the fitted saturation
    parameters but not re-simulated here — this is standard practice for
    budget simulator tools.

Field names here are a fixed API contract. Lovable's BudgetSimulator component
builds against these exact shapes — do not rename.
"""

import numpy as np
import pandas as pd
import arviz as az
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from pathlib import Path
from typing import Optional

from api.services.loader import get_inference_data
from api.services.inference import spend_stats_from_df, _to_samples, _hdi
from api.services.brand_config import get_brand_channels

router = APIRouter()

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR  = REPO_ROOT / "data"


# ── Request / response models ──────────────────────────────────────────────────

class SimulatorRequest(BaseModel):
    """
    budget_allocation: fractions per channel that must sum to 1.0.
        Example: {"Meta": 0.40, "TikTok": 0.30, "Paid_Search": 0.20, "Email": 0.10}

    budget_total: total weekly spend budget in dollars.
        If omitted, defaults to the brand's current mean weekly total spend
        (i.e. re-slicing the existing budget, not changing its size).
    """
    brand:             str
    priors:            str
    budget_allocation: dict[str, float]
    budget_total:      Optional[float] = None

    @field_validator("budget_allocation")
    @classmethod
    def allocation_must_sum_to_one(cls, v: dict[str, float]) -> dict[str, float]:
        total = sum(v.values())
        if not (0.98 <= total <= 1.02):          # 2% tolerance for floating point
            raise ValueError(
                f"budget_allocation fractions must sum to 1.0 (got {total:.4f}). "
                f"Example: {{\"Meta\": 0.4, \"TikTok\": 0.3, \"Paid_Search\": 0.2, \"Email\": 0.1}}"
            )
        return v

    @field_validator("budget_total")
    @classmethod
    def budget_must_be_positive(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError("budget_total must be a positive dollar amount.")
        return v


# ── Core prediction logic ──────────────────────────────────────────────────────

def _predict_revenue_samples(
    lam_samples:  np.ndarray,   # (n_samples, n_channels)
    beta_samples: np.ndarray,   # (n_samples, n_channels)
    baseline:     float,        # mean non-channel revenue (intercept + seasonality)
    x_norms:      np.ndarray,   # (n_channels,) normalized spend values [0, ∞)
) -> np.ndarray:
    """
    Evaluates the LogisticSaturation function at x_norms for all posterior draws.

    Formula (PyMC-Marketing LogisticSaturation):
        contribution(c) = beta[c] × sigmoid(lam[c] × x_norm[c])
        predicted_revenue = baseline + Σ_c contribution(c)

    Returns a (n_samples,) array of predicted weekly revenue values —
    one per posterior draw. The distribution of these values IS the
    posterior predictive distribution at the proposed spend level.

    Args:
        x_norms: proposed spend per channel, normalized by max observed spend.
                 x_norm = proposed_dollars / max_observed_weekly_dollars.
                 Values > 1.0 mean the proposed spend exceeds historical max.
    """
    # lam_samples * x_norms: (n_samples, n_channels) × (n_channels,) → broadcast
    lam_x      = lam_samples * x_norms[np.newaxis, :]         # (n_samples, n_channels)
    saturation = 1.0 / (1.0 + np.exp(-lam_x))                 # sigmoid
    contribs   = beta_samples * saturation                     # (n_samples, n_channels)
    return baseline + contribs.sum(axis=1)                     # (n_samples,)


# ── POST /simulator/predict ────────────────────────────────────────────────────

@router.post("/predict", tags=["simulator"])
def simulator_predict(req: SimulatorRequest) -> dict:
    """
    Predicts weekly revenue for a proposed budget allocation with full
    posterior uncertainty.

    Algorithm:
        1. Load posterior saturation parameters (lam, beta) — 2,000 draws each.
        2. Compute the non-channel baseline: mean observed revenue minus mean
           total channel contribution. This captures intercept + seasonality
           averaged over the dataset period.
        3. Evaluate the saturation function at proposed spend levels for every
           posterior draw → 2,000 predicted revenue values.
        4. Do the same for the current mean allocation → 2,000 baseline values.
        5. Delta = proposed − current, both as distributions.
        6. Return means and HDI credible intervals.

    Uncertainty interpretation:
        predicted_revenue_hdi_low / hdi_high
        "Given this model and prior, there is 94% probability that weekly
         revenue at this spend allocation would fall between these values."

    Response shape (fixed contract):
    {
      "brand":  "kova",
      "priors": "balanced",
      "predicted_revenue_mean":     45200.0,
      "predicted_revenue_hdi_low":  38400.0,
      "predicted_revenue_hdi_high": 52100.0,
      "current_revenue_mean":       41800.0,
      "delta_mean":                  3400.0,
      "delta_pct":                     8.13,
      "proposed_spend_per_channel": {"Meta": 6000.0, "TikTok": 4500.0, ...}
    }
    """
    # ── Load model and data ────────────────────────────────────────────────────
    try:
        idata = get_inference_data(req.brand, req.priors)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    channels = get_brand_channels(req.brand)

    csv_path = DATA_DIR / f"{req.brand}.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail=f"Dataset CSV not found: {csv_path.name}")
    df = pd.read_csv(csv_path, parse_dates=["Date"])

    # Validate that allocation keys match this brand's channels
    missing = set(channels) - set(req.budget_allocation.keys())
    extra   = set(req.budget_allocation.keys()) - set(channels)
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"budget_allocation is missing channels for brand '{req.brand}': {sorted(missing)}"
        )
    if extra:
        raise HTTPException(
            status_code=422,
            detail=f"budget_allocation contains unknown channels for brand '{req.brand}': {sorted(extra)}"
        )

    spend_totals, spend_maxes = spend_stats_from_df(df, channels)
    n_obs = len(df)

    # Mean weekly spend per channel (used as "current" baseline)
    mean_weekly_spend = {ch: spend_totals[ch] / n_obs for ch in channels}
    current_total_weekly = sum(mean_weekly_spend.values())

    # ── Posterior samples ──────────────────────────────────────────────────────
    contrib_da  = idata.posterior["channel_contribution_original_scale"]  # (chain, draw, date, channel)
    lam_samples = _to_samples(idata.posterior["saturation_lam"])   # (2000, n_ch)

    dims    = list(contrib_da.dims)
    obs_dim = dims[2]

    # ── Proposed spend ─────────────────────────────────────────────────────────
    budget_total = req.budget_total if req.budget_total is not None else current_total_weekly

    proposed_spend = {
        ch: budget_total * req.budget_allocation[ch]
        for ch in channels
    }

    # Normalize proposed and current spend by max observed weekly spend.
    # The model was fit on data scaled by MaxAbsScaler (÷ max), so x_norm
    # is the correct input to the saturation function.
    proposed_x_norms = np.array([
        proposed_spend[ch] / max(spend_maxes[ch], 1e-9)
        for ch in channels
    ])
    current_x_norms = np.array([
        mean_weekly_spend[ch] / max(spend_maxes[ch], 1e-9)
        for ch in channels
    ])

    # ── Saturation-ratio approach ──────────────────────────────────────────────
    # Problem: saturation_beta is in the model's normalized scale, but
    # channel_contribution_original_scale is in actual revenue dollars.
    # We can't mix them directly.
    #
    # Solution: use the model's own original-scale contributions as the baseline
    # and apply only the *ratio* of saturation responses to scale them.
    #
    #   proposed_contrib[k, c] = current_contrib[k, c]
    #                            × (sigmoid(lam[k,c] × proposed_x_norm[c])
    #                               / sigmoid(lam[k,c] × current_x_norm[c]))
    #
    # This stays entirely in original-scale revenue and only uses the saturation
    # function to answer: "by what fraction does the channel response change
    # if I move from current spend to proposed spend?"

    # Mean weekly original-scale contribution per channel, per posterior draw
    # Shape: (chain, draw, channel) → flatten → (2000, n_channels)
    contrib_weekly = _to_samples(contrib_da.mean(dim=obs_dim))  # (2000, n_ch)

    # Sigmoid at current and proposed x_norms — shape (2000, n_ch)
    def sigmoid(z: np.ndarray) -> np.ndarray:
        return 1.0 / (1.0 + np.exp(-z))

    sat_current  = sigmoid(lam_samples * current_x_norms[np.newaxis, :])
    sat_proposed = sigmoid(lam_samples * proposed_x_norms[np.newaxis, :])

    # Ratio: how much does the saturation response change per channel?
    # Guard against near-zero current saturation (channels with near-zero spend)
    sat_ratio = sat_proposed / np.where(sat_current > 1e-9, sat_current, 1e-9)

    # Scale original-scale weekly contributions by that ratio
    proposed_contribs = contrib_weekly * sat_ratio   # (2000, n_ch)

    # Per-draw baseline = observed mean revenue − this draw's total channel contribution
    # (captures intercept + mean seasonality without accessing those params directly)
    observed_mean_revenue   = float(df["Revenue"].mean())
    current_channel_totals  = contrib_weekly.sum(axis=1)          # (2000,)
    baseline_per_draw       = observed_mean_revenue - current_channel_totals  # (2000,)

    # Predicted revenue distributions
    proposed_samples = baseline_per_draw + proposed_contribs.sum(axis=1)  # (2000,)
    current_samples  = baseline_per_draw + contrib_weekly.sum(axis=1)     # (2000,)

    # Delta distribution — uncertainty in the improvement, not just the level
    delta_samples = proposed_samples - current_samples

    # ── Summarise ──────────────────────────────────────────────────────────────
    pred_mean    = float(np.mean(proposed_samples))
    pred_low, pred_high = _hdi(proposed_samples)

    current_mean = float(np.mean(current_samples))
    delta_mean   = float(np.mean(delta_samples))
    delta_pct    = (delta_mean / max(current_mean, 1e-9)) * 100.0

    return {
        "brand":  req.brand,
        "priors": req.priors,
        # Predicted revenue at proposed allocation
        "predicted_revenue_mean":     round(pred_mean, 2),
        "predicted_revenue_hdi_low":  round(pred_low,  2),
        "predicted_revenue_hdi_high": round(pred_high, 2),
        # Baseline for comparison (current mean weekly allocation)
        "current_revenue_mean":       round(current_mean, 2),
        # Change vs current
        "delta_mean":                 round(delta_mean, 2),
        "delta_pct":                  round(delta_pct,  2),
        # Proposed spend in dollars per channel — for display in the UI
        "proposed_spend_per_channel": {
            ch: round(proposed_spend[ch], 2) for ch in channels
        },
    }
