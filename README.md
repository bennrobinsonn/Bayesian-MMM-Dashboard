# Bayesian MMM Dashboard

A Bayesian Marketing Mix Modeling (MMM) dashboard built as a GSB 521 AWS capstone at Cal Poly SLO. Users explore how different "prior beliefs" about marketing channels change what a statistical model concludes about which channels drive revenue — and by how much.

The core thesis: marketing analysts rarely come to data neutral. They have opinions about which channels work. Bayesian inference gives a principled way to encode those opinions and update them with data. This dashboard makes that process interactive.

---

## The Three Brands

The dashboard ships with three pre-fit brand scenarios, each representing a distinct industry vertical with different channel mixes and spend dynamics.

### Kova — DTC Running Watch
> _"Performance-heavy, community-driven."_

A direct-to-consumer running watch brand scaling through paid social and search. Channels: **Meta, TikTok, Paid_Search, Email.**

TikTok is deliberately modeled to saturate at lower spend volumes than Meta — a niche product finds diminishing returns faster on viral short-form than on a retargeting-optimized platform. Email is a derived channel that tracks TikTok budget cycles at low unit cost.

### Poppa Bueno — CPG Hot Sauce
> _"TV-dominant. Viral heritage meets grocery retail."_

A family-owned hot sauce brand that went viral and is now scaling into retail. Channels: **TV, Meta, OOH, Trade_Promo.**

TV gets the largest share of budget for a mass-market CPG product. Trade promotions (in-store discounts, end-cap displays) are modeled as a lumpy derived channel — spend clusters around retail sell-in events, not a smooth weekly cadence.

### Nestwork — B2B SaaS / Proptech
> _"Long sales cycles. Compounding organic reach."_

A B2B platform for independent landlords that relies on thought leadership and high-intent channels. Channels: **LinkedIn, Content_SEO, Paid_Search, Webinars.**

Content/SEO is the most interesting channel here from a modeling standpoint: the adstock carry-over effect (the idea that spend this week still influences revenue three weeks from now) is especially strong for organic content. Webinars are event-driven with irregular cadence.

---

## The Bayesian Modeling Approach

### What is Marketing Mix Modeling?

MMM is a statistical technique that decomposes revenue into the contributions of each marketing channel, plus a baseline (what you'd sell with zero marketing). Classic MMM uses ordinary least squares regression. Bayesian MMM adds something important: **uncertainty quantification**.

Rather than outputting a single number ("Meta drives 23% of revenue"), a Bayesian model outputs a distribution: _"There is a 94% probability that Meta's contribution is between 18% and 28%."_ That range is a **credible interval** (specifically, a Highest Density Interval — HDI). It is not the same as a frequentist confidence interval. A 94% HDI means the parameter has a 94% probability of falling in that range, given the data and prior — a direct probability statement, which a confidence interval cannot make.

### PyMC-Marketing Model Spec

All nine models are fit using [PyMC-Marketing](https://www.pymc-marketing.io/):

```python
from pymc_marketing.mmm import MMM, GeometricAdstock, LogisticSaturation

mmm = MMM(
    adstock=GeometricAdstock(l_max=8),      # carry-over: spend echoes for up to 8 weeks
    saturation=LogisticSaturation(),         # diminishing returns: S-curve per channel
    channel_columns=CHANNEL_COLUMNS,
    date_column="Date",
    yearly_seasonality=2,
)
```

Two transformations are applied to spend before it enters the regression:

1. **Adstock (carry-over):** A $10k TV buy this week still influences sales next week and the week after. GeometricAdstock models this decay with a learned rate per channel.

2. **Saturation (diminishing returns):** Doubling spend does not double impact. LogisticSaturation fits an S-curve per channel — the dashboard's "Saturation Curves" view shows where each channel sits on that curve.

### Prior Configurations

Each brand is fit three times with different priors on the `saturation_beta` coefficient — the parameter controlling how strongly a channel drives revenue.

| Config | Sigma | Interpretation |
|---|---|---|
| `conservative` | 0.3 | Skeptical — tight prior, posterior stays close to zero unless the data is overwhelming |
| `balanced` | 0.7 | Neutral — moderate prior, data drives the posterior |
| `aggressive` | 1.5 | Believer — wide prior, high posterior flexibility, channels can run strong |

The prior sigma is where user "domain knowledge" enters the model. The prior sliders in the dashboard UI map to these three configurations. Selecting "conservative" doesn't change the data — it changes what the model assumes before seeing the data. Users can watch how their prior shifts the posterior attribution estimates.

### Model Files

Nine pre-fit models are stored as NetCDF InferenceData files (`.nc`), one per brand × prior combination:

```
models/
  kova_conservative.nc       (~55 MB)
  kova_balanced.nc
  kova_aggressive.nc
  poppa_bueno_conservative.nc
  poppa_bueno_balanced.nc
  poppa_bueno_aggressive.nc
  nestwork_conservative.nc
  nestwork_balanced.nc
  nestwork_aggressive.nc
```

In production these live in S3 (`mmm-project-inference-data`) and are loaded on demand by the FastAPI backend. All nine models converged with R-hat < 1.01 (the standard diagnostic for MCMC chain convergence).

---

## AWS Architecture

```
User Browser
     │
     ▼
 Lovable UI  (React, polished frontend)
     │
     ▼
 API Gateway  (HTTP API, us-east-1)
     │
     ▼
 EC2 t2.micro  (FastAPI + Uvicorn, us-east-1)
  │                │
  │                ▼
  │         Amazon Bedrock
  │         Claude Haiku
  │         (AI recommendation layer)
  │
  ▼
 S3 Bucket: mmm-project-inference-data
 (9 × .nc InferenceData files, ~495 MB total)
```

| Service | Purpose | Estimated Cost |
|---|---|---|
| EC2 t2.micro | Runs FastAPI backend | ~$0/mo (free tier), ~$8.50/mo after |
| S3 Standard | Stores 9 `.nc` model files | ~$0.01/mo |
| API Gateway (HTTP) | Routes requests to EC2 | ~$0–$1/mo |
| Amazon Bedrock (Haiku) | AI recommendation text | ~$0.50–$2/mo |
| CloudWatch + SNS | Billing alerts at $50/$100/$150 | Free tier |

All services in `us-east-1`.

---

## API Endpoints

The FastAPI backend exposes six endpoints. Response field names are a fixed contract — the Lovable frontend builds against them.

```
GET  /health
     → { "status": "ok", "version": "0.1.0" }

GET  /datasets
     → { "brands": [ { "id", "name", "vertical", "channels", "description" } ] }

GET  /model/results?dataset={brand_id}&priors={conservative|balanced|aggressive}
     → { "channel_contributions", "credible_intervals", "roas", "model_fit" }

GET  /model/saturation?dataset={brand_id}&priors={conservative|balanced|aggressive}
     → { "curves": { channel: [ { "spend", "contribution" } ] } }

POST /simulator/predict
     body: { "dataset", "priors", "budget_allocation": { "Channel": fraction } }
     → { "predicted_revenue", "predicted_revenue_hdi", "delta_vs_current" }

POST /recommend
     body: { "dataset", "priors", "current_allocation", "budget_total" }
     → { "recommendation_text", "suggested_allocation", "reasoning" }
```

Interactive docs available at `http://localhost:8000/docs` when running locally.

---

## Running Locally

### Prerequisites

- Python 3.11+
- Node.js 18+
- The 9 `.nc` model files in `models/` (generated by running `modeling/fit_models.py` locally — these require PyMC-Marketing and significant MCMC compute time)

### Backend

```bash
# Install Python dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn api.main:app --reload --port 8000
```

The `--reload` flag watches for file changes and restarts automatically. Remove it in production. API available at `http://localhost:8000`. Swagger UI at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend available at `http://localhost:3000`. Expects the FastAPI backend at `http://localhost:8000` — this is configured in `frontend/src/api.js`.

### Regenerating the Datasets

```bash
python modeling/engineer_datasets.py
```

Downloads the Garve synthetic MMM base CSV and engineers the three brand variants into `data/`. The brand/channel configuration is read from `datasets_config.json`.

### Refitting the Models

```bash
python modeling/fit_models.py
```

Fits all 9 models and saves `.nc` files to `models/`. This takes significant time (MCMC sampling) and requires PyMC-Marketing installed with a working PyMC/JAX backend. Ben runs this locally before deploying.

---

## Project Structure

```
mmm-project/
├── agents.md                    # Claude Code agent guide (project memory)
├── PROGRESS.md                  # Session-to-session status tracker
├── datasets_config.json         # Single source of truth: brand IDs, channels, priors
├── requirements.txt
├── setup_aws.sh                 # AWS infrastructure provisioning script
│
├── modeling/
│   ├── engineer_datasets.py     # Generates 3 brand CSVs from base dataset
│   └── fit_models.py            # Fits 9 Bayesian models, saves .nc files
│
├── data/
│   ├── kova.csv
│   ├── poppa_bueno.csv
│   └── nestwork.csv
│
├── models/
│   └── {brand_id}_{prior}.nc    # 9 pre-fit InferenceData files (~55 MB each)
│
├── api/
│   ├── main.py                  # FastAPI app entry point
│   ├── routes/
│   │   ├── model.py             # /model/results, /model/saturation
│   │   ├── simulator.py         # /simulator/predict
│   │   └── recommend.py         # /recommend
│   └── services/
│       ├── loader.py            # Loads .nc files from S3 (or local fallback)
│       ├── inference.py         # Extracts posteriors, HDIs, ROAS from InferenceData
│       ├── bedrock.py           # Amazon Bedrock / Claude Haiku integration
│       └── brand_config.py      # Reads datasets_config.json
│
└── frontend/
    └── src/
        ├── App.jsx
        ├── api.js               # All fetch calls to FastAPI
        └── components/
            ├── DatasetSelector.jsx
            ├── PriorSliders.jsx
            ├── AttributionChart.jsx
            ├── SaturationCurves.jsx
            ├── BudgetSimulator.jsx
            └── Recommendations.jsx
```

---

## Background

This project was built for GSB 521 (AWS Cloud Computing) at Cal Poly San Luis Obispo. The modeling approach is grounded in Bayesian statistics and the [PyMC-Marketing](https://www.pymc-marketing.io/) library, which implements the GeometricAdstock + LogisticSaturation model architecture used in academic and industry MMM literature.

The frontend skeleton is designed to be imported into [Lovable](https://lovable.dev/) for professional UI polish — the component structure and API contract are intentionally stable so that Lovable can add styling without touching business logic.
