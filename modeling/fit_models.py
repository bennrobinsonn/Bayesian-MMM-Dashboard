"""
fit_models.py
-------------
Fits 9 Bayesian MMM models (3 brands × 3 prior configs) using PyMC-Marketing
and saves each model's InferenceData as a .nc file for the dashboard API.

Ben runs this locally — MCMC sampling is compute-intensive and cannot run
inside an API call. Pre-fitting and storing posteriors is the standard
production pattern for Bayesian MMM.

Expected runtime: ~3–8 min per model, ~30–70 min total (CPU, 2 chains).
Output: models/{brand_id}_{prior_config}.nc  (9 files)

To upload to S3 once AWS credentials are configured:
    Uncomment the `upload_to_s3()` call at the bottom of main().

Usage:
    python modeling/fit_models.py            # fits all 9 models
    python modeling/fit_models.py --fast     # 200 draws (smoke test, ~2 min total)
    python modeling/fit_models.py --brand kova --prior balanced  # single model
"""

import argparse
import json
import time
import warnings
from itertools import product
from pathlib import Path

import arviz as az
import numpy as np
import pandas as pd

# Suppress PyMC/pytensor recompilation warnings that clutter the output
warnings.filterwarnings("ignore", category=UserWarning, module="pytensor")
warnings.filterwarnings("ignore", category=FutureWarning)

from pymc_marketing.mmm import MMM, GeometricAdstock, LogisticSaturation
from pymc_extras.prior import Prior

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO_ROOT   = Path(__file__).resolve().parent.parent
DATA_DIR    = REPO_ROOT / "data"
MODELS_DIR  = REPO_ROOT / "models"
CONFIG_PATH = REPO_ROOT / "datasets_config.json"
MODELS_DIR.mkdir(exist_ok=True)

# ── Sampler defaults ───────────────────────────────────────────────────────────
# NUTS (No-U-Turn Sampler) is PyMC's default HMC sampler.
# target_accept=0.9 reduces divergences, which are common in MMM models because
# saturation and adstock create curved, funnel-shaped posterior geometries.
SAMPLER_DEFAULTS = dict(
    chains=2,
    draws=1000,
    tune=500,           # tuning steps teach NUTS how wide each parameter's
                        # landscape is — discarded before saving posteriors
    target_accept=0.9,
    progressbar=True,
    random_seed=42,
)

# Fast mode for smoke-testing the pipeline without waiting for full convergence
SAMPLER_FAST = dict(
    chains=2,
    draws=200,
    tune=100,
    target_accept=0.9,
    progressbar=True,
    random_seed=42,
)

# R-hat threshold for convergence warnings.
# R-hat compares variance within chains vs. between chains.
# Values > 1.1 mean chains haven't mixed — posterior is unreliable.
RHAT_WARN_THRESHOLD = 1.1


# ── Model builder ──────────────────────────────────────────────────────────────
def build_mmm(channel_columns: list[str], prior_sigma: float) -> MMM:
    """
    Constructs a PyMC-Marketing MMM with the given channels and prior sigma.

    Architecture:
      GeometricAdstock(l_max=8)  — carryover effect: this week's ad spend
                                   influences sales for up to 8 future weeks,
                                   decaying geometrically (like a half-life).

      LogisticSaturation()       — diminishing returns: doubling spend does not
                                   double revenue. The saturation curve flattens
                                   as a channel approaches its audience ceiling.

    Prior configuration:
      saturation_beta ~ HalfNormal(sigma=prior_sigma)
        This is the key "domain knowledge" prior. It controls how large a
        channel's revenue contribution can be before seeing data.

        sigma=0.3 (conservative): tight leash — even with spend, the model
                                  is skeptical channels drive much revenue.
        sigma=0.7 (balanced):     neutral — data is the dominant voice.
        sigma=1.5 (aggressive):   wide prior — channels are assumed to be
                                  strong drivers; posterior can move a lot.

      intercept ~ Normal(0.5, 0.2)
        Baseline revenue when all spend is zero (seasonality + organic).

      likelihood ~ Normal(mu, HalfNormal(sigma=6))
        Observation noise — how much unexplained variance we allow around
        the predicted revenue. sigma=6 is intentionally wide to avoid
        the model over-attributing noise to channel effects.
    """
    return MMM(
        model_config={
            # Baseline revenue — organic + seasonality contribution
            "intercept": Prior("Normal", mu=0.5, sigma=0.2),

            # Channel contribution prior — THIS is where user "domain knowledge" enters
            # HalfNormal is used because contributions must be non-negative
            # (more spend should not hurt revenue in expectation)
            "saturation_beta": Prior("HalfNormal", sigma=prior_sigma),

            # Observation noise — wide to let channels explain what they can
            "likelihood": Prior("Normal", sigma=Prior("HalfNormal", sigma=6)),
        },
        date_column="Date",
        channel_columns=channel_columns,
        adstock=GeometricAdstock(l_max=8),      # 8-week carryover window
        saturation=LogisticSaturation(),         # S-curve diminishing returns
        yearly_seasonality=2,                    # 2 Fourier pairs capture annual
                                                 # seasonality without overfitting
    )


# ── Convergence diagnostics ────────────────────────────────────────────────────
def check_convergence(idata: az.InferenceData, label: str) -> None:
    """
    Checks R-hat for all posterior variables and warns if any exceed the
    threshold. R-hat > 1.1 means MCMC chains haven't converged — the
    posterior estimates should not be trusted for inference.
    """
    try:
        rhat = az.rhat(idata)
        bad  = {
            var: float(rhat[var].max())
            for var in rhat.data_vars
            if float(rhat[var].max()) > RHAT_WARN_THRESHOLD
        }
        if bad:
            print(f"  ⚠  CONVERGENCE WARNING [{label}]: R-hat > {RHAT_WARN_THRESHOLD} for:")
            for var, val in bad.items():
                print(f"       {var}: {val:.3f}")
            print("     Consider increasing draws/tune before using this model in production.")
        else:
            max_rhat = max(float(rhat[v].max()) for v in rhat.data_vars)
            print(f"  ✓  Convergence OK (max R-hat: {max_rhat:.3f})")
    except Exception as e:
        print(f"  ⚠  Could not compute R-hat: {e}")


# ── Fit one model ──────────────────────────────────────────────────────────────
def fit_one(
    brand_id: str,
    brand_name: str,
    channel_columns: list[str],
    prior_config: str,
    prior_sigma: float,
    sampler_kwargs: dict,
) -> Path:
    """
    Loads the brand CSV, fits one MMM, saves InferenceData to .nc, returns path.

    The .nc (NetCDF) format stores the full posterior distribution:
      - posterior group: samples for every model parameter
      - posterior_predictive group: model's predicted revenue distribution
      - observed_data group: the actual revenue values used for fitting
      - sample_stats group: NUTS diagnostics (divergences, tree depth, etc.)

    The FastAPI backend loads this file and extracts:
      - Channel contributions (posterior mean of saturation_beta × adstocked spend)
      - HDI credible intervals (az.hdi())
      - Saturation curves (LogisticSaturation evaluated across spend range)
      - ROAS with uncertainty (contribution / spend, with posterior samples)
    """
    out_path = MODELS_DIR / f"{brand_id}_{prior_config}.nc"

    if out_path.exists():
        print(f"  Skipping {out_path.name} — already exists. Delete to re-fit.")
        return out_path

    # Load dataset
    csv_path = DATA_DIR / f"{brand_id}.csv"
    df = pd.read_csv(csv_path, parse_dates=["Date"])

    # Split into features (X) and target (y)
    # X must contain the date column + all channel columns
    # y is the revenue series the model tries to predict
    X = df[["Date"] + channel_columns].copy()
    y = df["Revenue"].copy()

    print(f"\n{'─'*60}")
    print(f"  Brand  : {brand_name}  ({brand_id})")
    print(f"  Prior  : {prior_config}  (HalfNormal sigma={prior_sigma})")
    print(f"  Output : models/{brand_id}_{prior_config}.nc")
    print(f"  Chains : {sampler_kwargs['chains']}  "
          f"Draws: {sampler_kwargs['draws']}  "
          f"Tune: {sampler_kwargs['tune']}")
    print(f"{'─'*60}")

    mmm = build_mmm(channel_columns, prior_sigma)

    t0 = time.time()
    mmm.fit(X=X, y=y, **sampler_kwargs)
    elapsed = time.time() - t0
    print(f"  Sampling complete — {elapsed/60:.1f} min")

    idata = mmm.fit_result  # ArviZ InferenceData object
    check_convergence(idata, label=f"{brand_id}_{prior_config}")

    # Save to NetCDF — this is what the API will load from S3
    idata.to_netcdf(str(out_path))
    print(f"  Saved  → {out_path.relative_to(REPO_ROOT)}")

    return out_path


# ── S3 upload (stub — uncomment when AWS credentials are configured) ───────────
def upload_to_s3(models_dir: Path, bucket: str) -> None:
    """
    Uploads all .nc files in models/ to the S3 bucket.

    Prerequisites before uncommenting:
      1. AWS credentials configured: `aws configure sso --profile <your_profile>`
      2. S3 bucket exists: `aws s3 mb s3://{bucket} --profile <your_profile>`
      3. boto3 installed: `pip install boto3`

    Cost note: S3 PUT requests are $0.005 per 1,000 requests. 9 files = ~$0.00.
    Storage for 9 small .nc files (~50MB total) ≈ $0.001/month. Negligible.
    """
    import boto3
    session = boto3.Session(profile_name="mmm-project")
    s3 = session.client("s3", region_name="us-east-1")

    nc_files = list(models_dir.glob("*.nc"))
    print(f"\nUploading {len(nc_files)} .nc files to s3://{bucket}/")
    for nc_path in nc_files:
        s3.upload_file(
            Filename=str(nc_path),
            Bucket=bucket,
            Key=nc_path.name,
        )
        print(f"  Uploaded → s3://{bucket}/{nc_path.name}")
    print("Upload complete.")


# ── CLI argument parsing ───────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fit MMM models for the dashboard.")
    parser.add_argument(
        "--fast",
        action="store_true",
        help="Use reduced draws/tune for a quick smoke test (~2 min total).",
    )
    parser.add_argument(
        "--brand",
        type=str,
        default=None,
        help="Fit only this brand ID (e.g. kova, poppa_bueno, nestwork).",
    )
    parser.add_argument(
        "--prior",
        type=str,
        default=None,
        help="Fit only this prior config (conservative, balanced, aggressive).",
    )
    return parser.parse_args()


# ── Main ───────────────────────────────────────────────────────────────────────
def main() -> None:
    args = parse_args()

    config         = json.loads(CONFIG_PATH.read_text())
    brands         = {b["id"]: b for b in config["brands"]}
    prior_configs  = config["prior_configs"]
    s3_bucket      = config["s3_bucket"]
    sampler_kwargs = SAMPLER_FAST if args.fast else SAMPLER_DEFAULTS

    if args.fast:
        print("⚡ FAST MODE — using reduced draws. Not suitable for production posteriors.")

    # Filter to a single brand / prior if CLI flags were passed
    brand_ids    = [args.brand]  if args.brand else list(brands.keys())
    prior_names  = [args.prior]  if args.prior else list(prior_configs.keys())

    # Validate CLI args
    for bid in brand_ids:
        if bid not in brands:
            raise ValueError(f"Unknown brand '{bid}'. Valid: {list(brands.keys())}")
    for pname in prior_names:
        if pname not in prior_configs:
            raise ValueError(f"Unknown prior '{pname}'. Valid: {list(prior_configs.keys())}")

    combos = list(product(brand_ids, prior_names))
    print(f"\nFitting {len(combos)} model(s): "
          f"{[f'{b}_{p}' for b, p in combos]}")

    saved_paths = []
    total_start = time.time()

    for brand_id, prior_name in combos:
        brand      = brands[brand_id]
        prior_cfg  = prior_configs[prior_name]

        path = fit_one(
            brand_id=brand_id,
            brand_name=brand["name"],
            channel_columns=brand["channels"],
            prior_config=prior_name,
            prior_sigma=prior_cfg["sigma"],
            sampler_kwargs=sampler_kwargs,
        )
        saved_paths.append(path)

    total_elapsed = time.time() - total_start
    print(f"\n{'='*60}")
    print(f"All done — {len(saved_paths)} model(s) saved in {total_elapsed/60:.1f} min")
    print(f"Output directory: {MODELS_DIR.relative_to(REPO_ROOT)}/")
    for p in saved_paths:
        size_mb = p.stat().st_size / 1e6 if p.exists() else 0
        print(f"  {p.name}  ({size_mb:.1f} MB)")

    print(f"\nNext step: once AWS credentials are configured, call upload_to_s3()")
    print(f"  Target bucket: s3://{s3_bucket}/")
    print(f"  Uncomment the body of upload_to_s3() in this file to enable.")

    # ── S3 upload ──────────────────────────────────────────────────────────
    upload_to_s3(MODELS_DIR, s3_bucket)


if __name__ == "__main__":
    main()
