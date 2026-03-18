"""
api/routes/recommend.py
-----------------------
AI-powered budget recommendation endpoint.

POST /recommend
    → given a brand + prior config + current allocation, returns a plain-language
      recommendation grounded in the actual posterior values (ROAS, HDI,
      saturation status per channel).

When BEDROCK_ENABLED = False (default until AWS credentials are configured):
    Falls back to a rule-based local engine in bedrock.py. The response shape
    is identical — the frontend doesn't know or care which path was taken.

When BEDROCK_ENABLED = True:
    Calls Claude Haiku on Amazon Bedrock (anthropic.claude-haiku-20240307-v1:0)
    with a prompt that includes all posterior-derived numbers. The model
    generates plain-language advice grounded in the actual HDI and ROAS values.

Field names here are a fixed API contract. Lovable's Recommendations component
builds against these exact shapes — do not rename.
"""

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from pathlib import Path
from typing import Optional

from api.services.loader import get_inference_data
from api.services.inference import (
    get_channel_contributions,
    spend_stats_from_df,
    _to_samples,
)
from api.services.brand_config import get_brand_channels
from api.services.bedrock import get_recommendation, BEDROCK_ENABLED
import json

router = APIRouter()

REPO_ROOT   = Path(__file__).resolve().parent.parent.parent
DATA_DIR    = REPO_ROOT / "data"
CONFIG_PATH = REPO_ROOT / "datasets_config.json"


# ── Request model ──────────────────────────────────────────────────────────────

class RecommendRequest(BaseModel):
    """
    current_allocation: fractions per channel summing to 1.0.
        Represents the budget mix the user currently has dialled in on the
        BudgetSimulator sliders. The recommendation tells them how to improve it.

    budget_total: total weekly budget in dollars (optional).
        Used by Bedrock to give dollar-denominated advice. Defaults to the
        brand's mean historical weekly spend if omitted.
    """
    brand:              str
    priors:             str
    current_allocation: dict[str, float]
    budget_total:       Optional[float] = None

    @field_validator("current_allocation")
    @classmethod
    def must_sum_to_one(cls, v: dict[str, float]) -> dict[str, float]:
        total = sum(v.values())
        if not (0.98 <= total <= 1.02):
            raise ValueError(
                f"current_allocation fractions must sum to 1.0 (got {total:.4f})."
            )
        return v


# ── Saturation status helper ───────────────────────────────────────────────────

def _saturation_statuses(
    idata,
    channels:        list[str],
    mean_weekly_spend: dict[str, float],
    spend_maxes:     dict[str, float],
) -> dict[str, str]:
    """
    Classifies each channel as "room_to_grow", "moderate", or "near_saturated"
    based on where current spend sits on its posterior mean saturation curve.

    Method:
        At the current normalized spend level (x_norm = spend / max_spend),
        evaluate sigmoid(lam × x_norm). This gives the saturation fraction —
        what proportion of the channel's theoretical maximum contribution is
        currently being captured.

          < 0.35  → room_to_grow    (steep part of S-curve, high marginal return)
          0.35–0.65 → moderate      (middle of curve, reasonable marginal return)
          > 0.65  → near_saturated  (flat part, diminishing returns setting in)

    Uses the posterior mean of lam across all 2,000 draws for simplicity.
    """
    lam_samples = _to_samples(idata.posterior["saturation_lam"])  # (2000, n_ch)
    lam_mean    = lam_samples.mean(axis=0)                         # (n_ch,)

    statuses = {}
    for i, ch in enumerate(channels):
        x_norm   = mean_weekly_spend.get(ch, 0.0) / max(spend_maxes.get(ch, 1.0), 1e-9)
        sat_frac = 1.0 / (1.0 + np.exp(-lam_mean[i] * x_norm))   # sigmoid

        # Thresholds calibrated to the fitted lam range from PyMC-Marketing.
        # sigmoid(lam * x_norm) tends to be high even at mean spend, so we use
        # 0.75 as the "near_saturated" cutoff rather than 0.65 to avoid
        # classifying every channel as saturated on typical spend levels.
        if sat_frac < 0.50:
            statuses[ch] = "room_to_grow"
        elif sat_frac < 0.75:
            statuses[ch] = "moderate"
        else:
            statuses[ch] = "near_saturated"

    return statuses


# ── Suggested allocation ───────────────────────────────────────────────────────

def _suggested_allocation(
    contributions: list[dict],
    sat_statuses:  dict[str, str],
    current_allocation: dict[str, float],
    blend: float = 0.4,
) -> dict[str, float]:
    """
    Computes a suggested budget allocation by blending the current allocation
    with a ROAS-proportional target (40% shift by default).

    Full ROAS-proportional reallocation is too aggressive for a dashboard —
    it could suggest 0% on a channel because it has below-median ROAS while
    still being profitable. The blend factor creates a gentler nudge.

    Saturated channels get their ROAS-proportional weight halved as a penalty
    to further discourage piling on spend where diminishing returns are active.
    """
    roas = {c["channel"]: max(c["roas_mean"], 0.01) for c in contributions}

    # Apply saturation penalty
    adjusted = {
        ch: r * (0.5 if sat_statuses.get(ch) == "near_saturated" else 1.0)
        for ch, r in roas.items()
    }
    total_adj = sum(adjusted.values())
    roas_prop = {ch: v / total_adj for ch, v in adjusted.items()}

    # Blend: 60% keep current, 40% shift toward ROAS-proportional
    suggested = {
        ch: round((1 - blend) * current_allocation.get(ch, 0.0) + blend * roas_prop[ch], 4)
        for ch in roas
    }

    # Re-normalise to ensure sum = 1.0 (floating point safety)
    total = sum(suggested.values())
    return {ch: round(v / total, 4) for ch, v in suggested.items()}


# ── POST /recommend ────────────────────────────────────────────────────────────

@router.post("/recommend", tags=["recommend"])
def recommend(req: RecommendRequest) -> dict:
    """
    Returns a plain-language budget recommendation with a suggested allocation.

    The recommendation is grounded in three posterior-derived signals:
      1. ROAS with HDI     — which channels return the most per dollar, with uncertainty
      2. Saturation status — which channels are near their audience ceiling
      3. HDI width         — which channels the model is uncertain about

    A channel with high ROAS and room to grow = increase spend.
    A channel with low ROAS or near saturation = reduce spend.
    A channel with very wide HDI = flag for holdout testing before reallocating.

    Response shape (fixed contract):
    {
      "brand":  "kova",
      "priors": "balanced",
      "recommendation_text":  "<plain-language advice>",
      "suggested_allocation": {"Meta": 0.45, "TikTok": 0.18, ...},
      "reasoning": {
        "increase": ["Meta (ROAS 3.16, room to grow — ...)"],
        "decrease": ["Paid_Search (ROAS 1.08, ...)"],
        "maintain": ["Email"]
      },
      "channel_context": {
        "Meta": {"roas_mean": 3.16, "saturation_status": "room_to_grow", ...},
        ...
      },
      "bedrock_enabled": false
    }
    """
    # ── Load data ──────────────────────────────────────────────────────────────
    try:
        idata = get_inference_data(req.brand, req.priors)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    channels = get_brand_channels(req.brand)

    # Validate allocation keys match this brand's channels
    missing = set(channels) - set(req.current_allocation.keys())
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"current_allocation missing channels for '{req.brand}': {sorted(missing)}"
        )

    csv_path = DATA_DIR / f"{req.brand}.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail=f"Dataset CSV not found: {csv_path.name}")
    df = pd.read_csv(csv_path, parse_dates=["Date"])

    spend_totals, spend_maxes = spend_stats_from_df(df, channels)
    n_obs = len(df)
    mean_weekly_spend = {ch: spend_totals[ch] / n_obs for ch in channels}
    budget_total = req.budget_total or sum(mean_weekly_spend.values())

    # ── Posterior extractions ──────────────────────────────────────────────────
    contributions = get_channel_contributions(idata, channels, spend_totals)
    sat_statuses  = _saturation_statuses(idata, channels, mean_weekly_spend, spend_maxes)

    # ── Brand metadata (for Bedrock prompt) ───────────────────────────────────
    config  = json.loads(CONFIG_PATH.read_text())
    brand_meta = next(b for b in config["brands"] if b["id"] == req.brand)

    # ── Generate recommendation ────────────────────────────────────────────────
    rec = get_recommendation(
        brand_name=         brand_meta["name"],
        vertical=           brand_meta["vertical"],
        prior_config=       req.priors,
        contributions=      contributions,
        sat_statuses=       sat_statuses,
        current_allocation= req.current_allocation,
        budget_total=       budget_total,
    )

    suggested = _suggested_allocation(contributions, sat_statuses, req.current_allocation)

    # ── Channel context block (helps frontend render tooltips / detail panels) ─
    channel_context = {
        c["channel"]: {
            "contribution_pct":      c["contribution_pct"],
            "contribution_hdi_low":  c["contribution_hdi_low"],
            "contribution_hdi_high": c["contribution_hdi_high"],
            "roas_mean":             c["roas_mean"],
            "roas_hdi_low":          c["roas_hdi_low"],
            "roas_hdi_high":         c["roas_hdi_high"],
            "saturation_status":     sat_statuses[c["channel"]],
        }
        for c in contributions
    }

    return {
        "brand":                req.brand,
        "priors":               req.priors,
        "recommendation_text":  rec["recommendation_text"],
        "suggested_allocation": suggested,
        "reasoning":            rec["reasoning"],
        "channel_context":      channel_context,
        "bedrock_enabled":      BEDROCK_ENABLED,
    }
