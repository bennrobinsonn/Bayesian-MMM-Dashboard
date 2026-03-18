# MMM Project — Claude Code Agent Guide

You are helping Ben build a Bayesian Marketing Mix Modeling (MMM) dashboard for his GSB 521 AWS capstone project. Ben is an MS Business Analytics student at Cal Poly SLO with a statistics background and prior experience as a marketing data scientist. He understands concepts but needs help with implementation. Teach as you build.

---

## Project Overview

A Bayesian MMM dashboard that lets users explore channel attribution, credible intervals, saturation curves, and budget reallocation — with a prior-setting UI that teaches users what Bayesian inference means intuitively.

**Core thesis:** Users select a marketing scenario (industry vertical), set their "domain knowledge" via channel importance sliders (which map to Bayesian priors), and see how that belief updates the model's posterior distributions. A what-if budget simulator lets them drag spend across channels and see predicted revenue impact.

**Target audience / portfolio context:** Blue Alpha, a marketing measurement company. The UI should feel like a real analytics product, not a class project.

---

## Architecture

| Layer | Technology | AWS Service |
|---|---|---|
| Pre-fit model files | PyMC-Marketing `.nc` inference data | **S3** |
| Backend API | FastAPI (Python) | **EC2 t2.micro** |
| API routing | REST endpoints | **API Gateway** |
| AI recommendation layer | Anthropic Claude Haiku | **Amazon Bedrock** |
| Frontend skeleton | Minimal React (Claude Code) | — |
| Frontend polish | **Lovable** (imports skeleton) | — |

**AWS Region:** `us-east-1` for all services. Billing alarms also in `us-east-1`.

**Frontend strategy — two phases:**
1. **Claude Code writes a minimal React skeleton** — functional components, real API calls wired to the correct endpoints, zero styling. Just enough structure for Lovable to work with.
2. **Lovable polishes the skeleton** — Ben pastes the skeleton code into Lovable and prompts for a professional, polished UI. Lovable does not change API call logic or field names.

Claude Code's React skeleton scope (nothing more):
- `App.jsx` — routing between views
- `DatasetSelector.jsx` — dropdown to pick kova / poppa_bueno / nestwork
- `PriorSliders.jsx` — sliders for channel importance (conservative / balanced / aggressive)
- `AttributionChart.jsx` — bar chart of channel contributions with credible interval error bars
- `SaturationCurves.jsx` — line chart per channel showing diminishing returns
- `BudgetSimulator.jsx` — sliders to reallocate budget, shows predicted revenue delta
- `Recommendations.jsx` — displays AI recommendation text from /recommend endpoint
- `api.js` — all fetch calls to FastAPI, using endpoint shapes defined below

No CSS, no styling libraries, no UI component libraries. Lovable handles all of that.

---

## Current Status & Build Order

**AWS credentials are NOT yet configured.** Ben is awaiting IAM Identity Center access to a Cal Poly sandbox account. Do not attempt any AWS CLI commands until Ben confirms credentials are working.

**Build order given this constraint — start here:**
1. Write `modeling/engineer_datasets.py` and run it to generate 3 dataset CSVs
2. Write `modeling/fit_models.py` — Ben runs this locally to produce 9 `.nc` files
3. Write FastAPI backend (with local file loading as fallback until S3 is configured)
4. Write minimal React skeleton
5. **AWS setup resumes here once credentials are confirmed:**
6. Run `setup_aws.sh` — billing alerts, S3 bucket creation
7. Upload `.nc` files to S3, switch backend loader from local to S3
8. Deploy FastAPI to EC2
9. Configure API Gateway
10. Wire in Bedrock recommendation layer
11. Write README

---

## AWS Account Constraints

- **$200 spending limit** — account wipes if exceeded
- **750 hours** from lease start — account wipes at expiration
- AWS profile name is in `~/.aws/credentials` (format: `123456789_myisb_IsbUsersPS`)
- Always use `--profile` flag in AWS CLI commands
- Always estimate cost before provisioning any service
- Warn loudly before using anything that could run up charges (NAT Gateway, GPU instances, OpenSearch, large RDS)

---

## Dataset Strategy

**Source:** Garve synthetic MMM dataset
```python
import pandas as pd
data = pd.read_csv(
    'https://raw.githubusercontent.com/Garve/datasets/4576d323bf2b66c906d5130d686245ad205505cf/mmm.csv',
    parse_dates=['Date']
)
# Columns: Date, TV, Radio, Banners, Sales
```

**Three brand variants** (engineered from the base dataset by rescaling spend and renaming channels):

| Brand ID | Name | Vertical | Channels |
|---|---|---|---|
| `kova` | Kova | DTC / Performance | Meta, TikTok, Paid_Search, Email |
| `poppa_bueno` | Poppa Bueno | CPG / Retail | TV, Meta, OOH, Trade_Promo |
| `nestwork` | Nestwork | B2B SaaS / Proptech | LinkedIn, Content_SEO, Paid_Search, Webinars |

Brand metadata (descriptions, spend profiles, channel lists) lives in `datasets_config.json` at the repo root — this is the single source of truth. Do not hardcode brand/channel names anywhere else.

**Nine pre-fit model files** (3 brands × 3 prior configs):

| Prior Config | Meaning | Sigma values |
|---|---|---|
| `conservative` | User is skeptical of all channels | 0.3 per channel |
| `balanced` | Neutral / no strong belief | 0.7 per channel |
| `aggressive` | User believes channels are strong drivers | 1.5 per channel |

File naming convention: `{brand_id}_{prior_config}.nc`
Example: `kova_balanced.nc`, `poppa_bueno_conservative.nc`, `nestwork_aggressive.nc`

All 9 files live in S3 bucket: `mmm-project-inference-data`

---

## PyMC-Marketing Model Spec

```python
from pymc_marketing.mmm import MMM, GeometricAdstock, LogisticSaturation
from pymc_extras.prior import Prior

mmm = MMM(
    model_config={
        "intercept": Prior("Normal", mu=0.5, sigma=0.2),
        "saturation_beta": Prior("HalfNormal", sigma=prior_sigma),  # varies by config
        "likelihood": Prior("Normal", sigma=Prior("HalfNormal", sigma=6)),
    },
    date_column="Date",
    adstock=GeometricAdstock(l_max=8),
    saturation=LogisticSaturation(),
    channel_columns=CHANNEL_COLUMNS,  # varies by dataset
    yearly_seasonality=2,
)
```

**Key Bayesian concepts to expose in the API responses:**
- Credible intervals (HDI) on channel coefficients — NOT confidence intervals
- Posterior mean channel contributions (% of revenue)
- Saturation curves per channel (diminishing returns)
- Adstock decay per channel (carryover effect)
- ROAS with uncertainty bounds

---

## FastAPI Backend Structure

```
mmm-project/
├── agents.md               # this file
├── api/
│   ├── main.py             # FastAPI app, CORS config
│   ├── routes/
│   │   ├── model.py        # /model/results, /model/contributions
│   │   ├── simulator.py    # /simulator/predict (budget what-if)
│   │   └── recommend.py    # /recommend (Bedrock AI layer)
│   └── services/
│       ├── loader.py       # loads .nc files from S3
│       ├── inference.py    # extracts posteriors from InferenceData
│       └── bedrock.py      # Bedrock Claude Haiku calls
├── modeling/
│   ├── engineer_datasets.py   # generates 3 dataset variants from base CSV
│   └── fit_models.py          # fits 9 models, saves .nc files — BEN RUNS THIS LOCALLY
├── requirements.txt
├── setup_aws.sh            # billing alerts, S3 bucket, EC2 setup
└── README.md
```

---

## API Endpoints (Lovable will call these)

```
GET  /health
GET  /datasets                          → list of available datasets + descriptions
GET  /model/results?dataset=ecommerce&priors=balanced
     → { channel_contributions, credible_intervals, roas, model_fit }
GET  /model/saturation?dataset=ecommerce&priors=balanced
     → { curves per channel for plotting }
POST /simulator/predict
     → body: { dataset, priors, budget_allocation: {TV: 0.4, Search: 0.3, ...} }
     → { predicted_revenue, predicted_revenue_hdi, delta_vs_current }
POST /recommend
     → body: { dataset, priors, current_allocation, budget_total }
     → { recommendation_text, suggested_allocation, reasoning }
```

**CORS:** Allow all origins during development. Lock down before final deploy.

**Response shapes are fixed contracts.** Do not change field names once established — Lovable builds against them.

---

## Bedrock / AI Recommendation Layer

Model: `anthropic.claude-haiku-20240307-v1:0`
Region: `us-east-1`

The `/recommend` endpoint calls Bedrock with a prompt that includes:
- Current channel attributions + credible intervals
- Current budget allocation
- Saturation curve status per channel (near-saturated vs. room to grow)
- User's prior config (conservative/balanced/aggressive)

Returns a plain-language recommendation: which channels to increase, which to cut, why — grounded in the actual posterior values.

Keep Bedrock calls cheap: max_tokens=500, temperature=0.3.

---

## Key Concepts to Preserve in Code + Comments

Always comment code with the Bayesian concept it represents. Examples:

```python
# HDI = Highest Density Interval — Bayesian credible interval
# "There is a 94% probability that TV contributes between X% and Y% of revenue"
# This is NOT the same as a frequentist confidence interval

# HalfNormal(sigma=0.7) prior = moderate belief this channel is a positive driver
# Higher sigma = more freedom for the posterior to move
# This is where user "domain knowledge" enters the model
```

---

## Teaching Approach

1. **Before writing code**, briefly explain what the next piece does and why
2. **Cost check** before provisioning any AWS service
3. **Quiz Ben** before moving to a new service: ask 1-2 questions in plain language
4. **Explain the why** — not just what to do
5. Keep code minimal and well-commented. Ben needs to explain everything in a YouTube video.

---

## Modeling Script Note

`modeling/fit_models.py` is the one script Ben runs locally (not on EC2). MCMC sampling requires compute time and pymc-marketing installed. This script:
1. Loads + engineers all 3 dataset variants
2. Fits 9 models (3 datasets × 3 prior configs)
3. Saves `.nc` inference files locally
4. Uploads them to S3

Everything else Claude Code can drive end-to-end.

---

## Do Not

- Do not write CSS, styling, or use UI component libraries in React — Lovable handles all styling
- Do not go beyond the 7 components + api.js listed in the frontend skeleton scope
- Do not use GPU instances, NAT Gateway, OpenSearch, or large RDS instances
- Do not hardcode AWS credentials anywhere — use the profile from `~/.aws/credentials`
- Do not change API response field names once established — Lovable builds against them
- Do not skip cost estimates before provisioning
- Do not attempt AWS CLI commands until Ben confirms sandbox credentials are working
