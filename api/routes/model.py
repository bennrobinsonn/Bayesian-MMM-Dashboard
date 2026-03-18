"""
api/routes/model.py
-------------------
Endpoints that serve posterior results from pre-fit MMM models.

GET /model/results?brand=kova&priors=balanced
    → channel attributions, credible intervals, ROAS, model fit stats

GET /model/saturation?brand=kova&priors=balanced
    → saturation curve points per channel for the frontend line chart

These are read-only endpoints — they load a pre-fit InferenceData object
from loader.py and extract quantities via inference.py. No model fitting
happens at request time.

Field names here are a fixed API contract. Lovable's AttributionChart and
SaturationCurves components build against these exact shapes — do not rename.
"""

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pathlib import Path

from api.services.loader import get_inference_data
from api.services.inference import (
    get_channel_contributions,
    get_saturation_curves,
    get_model_fit,
    spend_stats_from_df,
)
from api.services.brand_config import get_brand_channels

router  = APIRouter()

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR  = REPO_ROOT / "data"


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _load_brand_df(brand: str) -> pd.DataFrame:
    """Loads the brand's CSV. Small file (200 rows) — fast per-request load."""
    csv_path = DATA_DIR / f"{brand}.csv"
    if not csv_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Dataset CSV not found for brand '{brand}'. "
                   f"Run modeling/engineer_datasets.py to generate it."
        )
    return pd.read_csv(csv_path, parse_dates=["Date"])


def _get_idata(brand: str, priors: str):
    """Loads InferenceData, converts known errors to clean HTTP responses."""
    try:
        return get_inference_data(brand, priors)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── GET /model/results ─────────────────────────────────────────────────────────

@router.get("/results", tags=["model"])
def model_results(
    brand:  str = Query(..., description="Brand ID: kova | poppa_bueno | nestwork"),
    priors: str = Query(..., description="Prior config: conservative | balanced | aggressive"),
) -> dict:
    """
    Returns channel attributions and ROAS with 94% HDI credible intervals,
    plus model fit statistics (R², RMSE).

    The credible intervals are the core Bayesian output:
        contribution_hdi_low / contribution_hdi_high
        "There is 94% probability this channel's true contribution
         to revenue lies between these two values."

    This is a direct probability statement about the parameter —
    not a frequentist confidence interval about the sampling procedure.

    Response shape (fixed contract):
    {
      "brand":  "kova",
      "priors": "balanced",
      "channel_contributions": [
        {
          "channel":               "Meta",
          "contribution_pct":      34.1,
          "contribution_hdi_low":  28.3,
          "contribution_hdi_high": 41.0,
          "roas_mean":             2.4,
          "roas_hdi_low":          1.8,
          "roas_hdi_high":         3.1
        },
        ...
      ],
      "model_fit": {
        "r_squared": 0.924,
        "rmse":      1243.5,
        "n_obs":     200
      }
    }
    """
    idata    = _get_idata(brand, priors)
    channels = get_brand_channels(brand)
    df       = _load_brand_df(brand)

    spend_totals, _ = spend_stats_from_df(df, channels)

    contributions = get_channel_contributions(idata, channels, spend_totals)
    fit_stats     = get_model_fit(idata, df["Revenue"].values)

    return {
        "brand":                brand,
        "priors":               priors,
        "channel_contributions": contributions,
        "model_fit":            fit_stats,
    }


# ── GET /model/saturation ──────────────────────────────────────────────────────

@router.get("/saturation", tags=["model"])
def model_saturation(
    brand:  str = Query(..., description="Brand ID: kova | poppa_bueno | nestwork"),
    priors: str = Query(..., description="Prior config: conservative | balanced | aggressive"),
) -> dict:
    """
    Returns saturation curve points per channel for the frontend line chart.

    Each channel gets 50 (spend, contribution) points evaluated from $0 to
    1.5× the max observed weekly spend. The hdi_low / hdi_high band shows
    uncertainty about the shape of the curve itself.

    What to look for on the chart:
      - A channel near the flat top of its curve is saturated — adding spend
        here has low marginal return.
      - A channel on the steep part still has room to grow efficiently.
      - Wide HDI bands mean the model is uncertain about how the saturation
        curve behaves — often because the channel has limited spend history.

    Response shape (fixed contract):
    {
      "brand":  "kova",
      "priors": "balanced",
      "curves": {
        "Meta": [
          {
            "spend":             0.0,
            "contribution_mean": 0.0,
            "hdi_low":           0.0,
            "hdi_high":          0.0
          },
          ...  (50 points total)
        ],
        "TikTok": [ ... ],
        ...
      }
    }
    """
    idata    = _get_idata(brand, priors)
    channels = get_brand_channels(brand)
    df       = _load_brand_df(brand)

    _, spend_maxes = spend_stats_from_df(df, channels)

    curves = get_saturation_curves(idata, channels, spend_maxes)

    return {
        "brand":  brand,
        "priors": priors,
        "curves": curves,
    }
