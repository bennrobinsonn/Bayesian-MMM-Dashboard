"""
api/services/loader.py
----------------------
Single responsibility: given a brand_id and prior_config, return the
corresponding ArviZ InferenceData object.

Today it reads from the local models/ directory.
When AWS credentials are configured, swap to the S3 loader by:
  1. Uncommenting the boto3 block in _load_from_s3()
  2. Setting USE_S3 = True

Nothing outside this file needs to change — routes call get_inference_data()
and never know whether the source is disk or S3. That's the point.

InferenceData recap:
  An ArviZ InferenceData object is what PyMC saves after MCMC sampling.
  It contains several "groups" stored as xarray Datasets:
    - posterior          → samples for every model parameter (chains × draws × params)
    - posterior_predictive → model's predicted revenue distribution
    - observed_data      → the actual revenue values used for fitting
    - sample_stats       → NUTS diagnostics (divergences, tree depth, energy)

  The inference.py service layer extracts channel contributions, HDI
  credible intervals, and saturation curves from the posterior group.
"""

import io
import json
from functools import lru_cache
from pathlib import Path

import arviz as az
import xarray as xr

# ── Config ─────────────────────────────────────────────────────────────────────
REPO_ROOT    = Path(__file__).resolve().parent.parent.parent
MODELS_DIR   = REPO_ROOT / "models"
CONFIG_PATH  = REPO_ROOT / "datasets_config.json"

# Files are now uploaded to S3 — use the S3 loader on EC2.
# The EC2 instance uses its IAM role (no hardcoded credentials).
USE_S3 = True

_config = json.loads(CONFIG_PATH.read_text())
VALID_BRAND_IDS    = {b["id"] for b in _config["brands"]}
VALID_PRIOR_CONFIGS = set(_config["prior_configs"].keys())
S3_BUCKET          = _config["s3_bucket"]


# ── Validation helper ──────────────────────────────────────────────────────────
def validate_params(brand_id: str, prior_config: str) -> None:
    """
    Raises ValueError with a clear message if brand_id or prior_config are not
    in datasets_config.json. FastAPI will catch ValueError and return a 422.
    Called before any file I/O to fail fast.
    """
    if brand_id not in VALID_BRAND_IDS:
        raise ValueError(
            f"Unknown brand '{brand_id}'. "
            f"Valid options: {sorted(VALID_BRAND_IDS)}"
        )
    if prior_config not in VALID_PRIOR_CONFIGS:
        raise ValueError(
            f"Unknown prior config '{prior_config}'. "
            f"Valid options: {sorted(VALID_PRIOR_CONFIGS)}"
        )


# ── Local loader ───────────────────────────────────────────────────────────────
def _load_from_disk(brand_id: str, prior_config: str) -> az.InferenceData:
    """
    Loads a .nc InferenceData file from the local models/ directory.

    File naming convention: {brand_id}_{prior_config}.nc
    Example: models/kova_balanced.nc

    Raises FileNotFoundError with a helpful message if the model hasn't been
    fit yet — directing Ben to run fit_models.py first.
    """
    nc_path = MODELS_DIR / f"{brand_id}_{prior_config}.nc"

    if not nc_path.exists():
        raise FileNotFoundError(
            f"Model file not found: {nc_path}\n"
            f"Run `python modeling/fit_models.py --brand {brand_id} --prior {prior_config}` "
            f"to generate it."
        )

    # PyMC-Marketing saves the posterior as a flat xarray Dataset (not grouped).
    # az.from_netcdf() returns an empty InferenceData because it finds no
    # standard ArviZ group names. We load with xarray directly and wrap the
    # Dataset into the posterior group so inference.py can use idata.posterior.
    ds = xr.open_dataset(str(nc_path))
    return az.InferenceData(posterior=ds)


# ── S3 loader (stub — uncomment when AWS credentials are configured) ───────────
def _load_from_s3(brand_id: str, prior_config: str) -> az.InferenceData:
    """
    Downloads a .nc file from S3 into memory and returns InferenceData.

    Loads into a BytesIO buffer rather than writing to disk — keeps the EC2
    instance stateless. Each server restart re-fetches from S3 on first call,
    then the lru_cache holds it for the lifetime of the process.

    Prerequisites:
      1. AWS credentials configured on the EC2 instance (IAM role, not hardcoded)
      2. .nc files uploaded via upload_to_s3() in fit_models.py
      3. boto3 installed (it's in requirements.txt)
    """
    import boto3
    session = boto3.Session()  # uses IAM role on EC2, no hardcoded credentials
    s3 = session.client("s3", region_name="us-east-1")

    key = f"{brand_id}_{prior_config}.nc"
    buf = io.BytesIO()
    s3.download_fileobj(S3_BUCKET, key, buf)
    buf.seek(0)

    # PyMC-Marketing saves as a flat xarray Dataset; wrap into posterior group
    ds = xr.open_dataset(buf)
    return az.InferenceData(posterior=ds)


# ── Public interface ───────────────────────────────────────────────────────────
# lru_cache memoizes the result by (brand_id, prior_config).
# Loading and deserializing a .nc file takes ~1–3 seconds; caching means the
# first request pays that cost and all subsequent requests return instantly.
# maxsize=9 matches exactly the number of pre-fit model files (3 brands × 3 priors).
@lru_cache(maxsize=9)
def get_inference_data(brand_id: str, prior_config: str) -> az.InferenceData:
    """
    Returns the ArviZ InferenceData for the given brand + prior combination.

    This is the only function routes should import from this module.
    The USE_S3 flag controls which backend is used transparently.

    Args:
        brand_id:     one of "kova", "poppa_bueno", "nestwork"
        prior_config: one of "conservative", "balanced", "aggressive"

    Returns:
        az.InferenceData with groups: posterior, posterior_predictive,
        observed_data, sample_stats

    Raises:
        ValueError:       invalid brand_id or prior_config
        FileNotFoundError: model file not found locally (USE_S3=False)
        NotImplementedError: USE_S3=True but credentials not yet configured
    """
    validate_params(brand_id, prior_config)

    if USE_S3:
        return _load_from_s3(brand_id, prior_config)
    else:
        return _load_from_disk(brand_id, prior_config)


def clear_cache() -> None:
    """
    Clears the in-memory InferenceData cache.
    Call this if you re-upload .nc files to S3 and want the API to pick up
    the new versions without restarting the server.
    """
    get_inference_data.cache_clear()
