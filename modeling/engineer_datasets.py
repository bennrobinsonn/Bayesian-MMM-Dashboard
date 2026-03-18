"""
engineer_datasets.py
--------------------
Downloads the Garve synthetic MMM dataset and engineers 3 brand-specific
variants for use in the Bayesian MMM dashboard.

Source columns: Date, TV, Radio, Banners, Sales

Brand strategy is defined in datasets_config.json at the repo root.
This script reads channel names and descriptions from that config so that
engineer_datasets.py and fit_models.py always stay in sync.

Output files (written to ../data/):
  kova.csv        — Date, Meta, TikTok, Paid_Search, Email, Revenue
  poppa_bueno.csv — Date, TV, Meta, OOH, Trade_Promo, Revenue
  nestwork.csv    — Date, LinkedIn, Content_SEO, Paid_Search, Webinars, Revenue
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR  = REPO_ROOT / "data"
CONFIG_PATH = REPO_ROOT / "datasets_config.json"
DATA_DIR.mkdir(exist_ok=True)

SOURCE_URL = (
    "https://raw.githubusercontent.com/Garve/datasets/"
    "4576d323bf2b66c906d5130d686245ad205505cf/mmm.csv"
)

# ── Reproducibility ────────────────────────────────────────────────────────────
RNG = np.random.default_rng(42)


# ── Helper: derive a correlated synthetic channel ─────────────────────────────
def derive_channel(base: pd.Series, scale: float, noise_frac: float = 0.18) -> pd.Series:
    """
    Creates a synthetic 4th channel correlated with an existing spend series.

    In practice, derived channels (Email, Trade_Promo, Webinars) tend to scale
    with a related primary channel — e.g. Webinar spend tracks Content/SEO budget
    cycles. We model that with a scaled fraction + proportional noise.

    Args:
        base:       source spend series to derive from
        scale:      multiplier controlling the relative budget size
        noise_frac: noise as a fraction of scaled std (models irregular spend cadence)
    """
    scaled = base * scale
    noise  = RNG.normal(loc=0, scale=scaled.std() * noise_frac, size=len(scaled))
    return (scaled + noise).clip(lower=0)  # spend can't go negative


# ── Load source data ───────────────────────────────────────────────────────────
def load_source() -> pd.DataFrame:
    print("Downloading Garve MMM dataset...")
    df = pd.read_csv(SOURCE_URL, parse_dates=["Date"])
    print(f"  Loaded {len(df)} rows | columns: {list(df.columns)}\n")
    return df


# ── Brand builders ─────────────────────────────────────────────────────────────

def build_kova(df: pd.DataFrame) -> pd.DataFrame:
    """
    Kova — DTC running watch brand.

    Channel mapping from source:
      TV      → Meta         (awareness + retargeting; performance-optimised)
      Banners → TikTok       (visual/short-form social; saturates faster — lower max spend)
      Radio   → Paid_Search  (intent-based, like radio reach but conversion-focused)
      derived → Email        (derived from TikTok budget cycles; low unit cost)

    Spend profile: performance-heavy, lower absolute magnitudes than CPG or SaaS.
    TikTok scaled down deliberately — it saturates at lower volumes for a niche
    product like a running watch, which the LogisticSaturation layer will capture.

    Revenue: ~1.8× Sales — DTC brands have moderate ACV and direct margin.
    """
    out = pd.DataFrame()
    out["Date"]        = df["Date"]
    out["Meta"]        = df["TV"]      * 0.45   # awareness/retargeting; scaled down vs. broadcast TV
    out["TikTok"]      = df["Banners"] * 0.55   # social/visual; intentionally lower ceiling
    out["Paid_Search"] = df["Radio"]   * 1.10   # intent channel; indexed up for DTC conversion focus
    out["Email"]       = derive_channel(
        df["Banners"], scale=0.18,               # Email ≈ 18% of social budget; cheap to run
        noise_frac=0.12                          # relatively consistent send cadence
    )
    out["Revenue"]     = df["Sales"]   * 1.8
    return out


def build_poppa_bueno(df: pd.DataFrame) -> pd.DataFrame:
    """
    Poppa Bueno — family-owned hot sauce CPG scaling into retail.

    Channel mapping from source:
      TV      → TV           (broadcast-dominant; hot sauce is a mass-market product)
      Radio   → OOH          (out-of-home: grocery store signage, transit — broad reach)
      Banners → Meta         (digital/social; viral heritage makes social efficient)
      derived → Trade_Promo  (in-store promos derived from OOH budget; event-driven, lumpy)

    Spend profile: TV gets the biggest slice. OOH is the second-largest channel.
    Trade_Promo is lumpy — promotional events cluster around retail sell-in periods.

    Revenue: ~1.0× Sales — CPG revenue is volume-driven with thin margins.
    """
    out = pd.DataFrame()
    out["Date"]        = df["Date"]
    out["TV"]          = df["TV"]      * 1.70   # dominant channel for a mass CPG brand
    out["OOH"]         = df["Radio"]   * 1.20   # high OOH; billboards near grocery chains
    out["Meta"]        = df["Banners"] * 1.30   # viral social heritage = efficient Meta spend
    out["Trade_Promo"] = derive_channel(
        df["Radio"], scale=0.65,                 # Trade Promo ≈ 65% of OOH budget
        noise_frac=0.30                          # high noise = lumpy promotional calendar
    )
    out["Revenue"]     = df["Sales"]   * 1.0
    return out


def build_nestwork(df: pd.DataFrame) -> pd.DataFrame:
    """
    Nestwork — B2B proptech SaaS for independent landlords.

    Channel mapping from source:
      TV      → LinkedIn     (B2B 'broadcast' channel; high CPM, targets decision-makers)
      Radio   → Content_SEO  (organic reach analogue; builds compounding value over time —
                               the adstock carry-over effect is especially important here)
      Banners → Paid_Search  (high-intent B2B search; expensive CPC, lower volume)
      derived → Webinars     (derived from Content/SEO budget cycles; event cadence adds noise)

    Spend profile: lower overall spend than consumer brands. LinkedIn dominates.
    Webinars are event-driven — irregular cadence modeled with higher noise_frac.

    Revenue: ~3.5× Sales — SaaS ACV is high; each conversion is worth much more
    than a CPG or DTC purchase. Long sales cycles mean adstock effects matter more.
    """
    out = pd.DataFrame()
    out["Date"]        = df["Date"]
    out["LinkedIn"]    = df["TV"]      * 0.50   # expensive CPMs; budget constrained vs. TV
    out["Content_SEO"] = df["Radio"]   * 0.75   # SEO spend is modest but compounds over time
    out["Paid_Search"] = df["Banners"] * 1.05   # B2B intent search — near 1:1 with display
    out["Webinars"]    = derive_channel(
        df["Radio"], scale=0.28,                 # Webinar budget ≈ 28% of Content/SEO
        noise_frac=0.22                          # event scheduling = moderately lumpy
    )
    out["Revenue"]     = df["Sales"]   * 3.5
    return out


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    # Load config so column names here match exactly what fit_models.py will use
    config = json.loads(CONFIG_PATH.read_text())
    brand_meta = {b["id"]: b for b in config["brands"]}

    df = load_source()

    builders = {
        "kova":        build_kova,
        "poppa_bueno": build_poppa_bueno,
        "nestwork":    build_nestwork,
    }

    for brand_id, builder in builders.items():
        variant = builder(df)
        out_path = DATA_DIR / f"{brand_id}.csv"
        variant.to_csv(out_path, index=False)

        meta         = brand_meta[brand_id]
        channel_cols = [c for c in variant.columns if c not in ("Date", "Revenue")]

        print(f"── {brand_id}.csv  ({meta['name']} | {meta['vertical']}) ──")
        print(f"  Columns : {list(variant.columns)}")
        print(f"  First 3 rows:")
        print(variant.head(3).to_string(index=False))
        print(f"  Spend means (weekly): { {c: round(variant[c].mean(), 1) for c in channel_cols} }")
        print(f"  Revenue  — mean: {variant['Revenue'].mean():.1f}  std: {variant['Revenue'].std():.1f}")
        print(f"  Saved → data/{brand_id}.csv\n")

    print("Done. 3 brand CSVs written to data/")


if __name__ == "__main__":
    main()
