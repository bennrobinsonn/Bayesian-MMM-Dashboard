# MMM Project — Progress Tracker

_Last updated: 2026-03-18_
_This file is the session-to-session memory for this project. Update it at the end of each working session._

---

## What Is This Project

A Bayesian Marketing Mix Modeling (MMM) dashboard built as a GSB 521 AWS capstone at Cal Poly SLO. Users select a marketing scenario (brand / industry vertical), set channel priors via sliders, and explore how their "domain knowledge" updates Bayesian posterior distributions — channel attribution, credible intervals, saturation curves, and a budget reallocation simulator. An AI recommendation layer (Amazon Bedrock / Claude Haiku) synthesizes the model output into plain-language advice.

Target audience: Blue Alpha (marketing measurement company). The UI is designed to look like a real analytics product.

---

## Status: Complete

### 1. Modeling Pipeline
- **`modeling/engineer_datasets.py`** — Downloads the Garve synthetic MMM CSV, engineers 3 brand variants with realistic spend profiles and derived channels. Writes to `data/`.
- **`modeling/fit_models.py`** — Fits 9 PyMC-Marketing models (3 brands × 3 prior configs) using GeometricAdstock + LogisticSaturation. Saves `.nc` InferenceData files to `models/`.
- **`datasets_config.json`** — Single source of truth for brand IDs, channel names, descriptions, and prior sigma values. All scripts read from this; nothing is hardcoded.
- **9 model files in `models/`** — All fit locally, all R-hat < 1.01 (good convergence):
  - `kova_conservative.nc`, `kova_balanced.nc`, `kova_aggressive.nc`
  - `poppa_bueno_conservative.nc`, `poppa_bueno_balanced.nc`, `poppa_bueno_aggressive.nc`
  - `nestwork_conservative.nc`, `nestwork_balanced.nc`, `nestwork_aggressive.nc`
  - Each ~55 MB. Total: ~495 MB.

### 2. FastAPI Backend
- **`api/main.py`** — FastAPI app, CORS open for dev, registers routers.
- **`api/routes/model.py`** — `GET /model/results` and `GET /model/saturation`
- **`api/routes/simulator.py`** — `POST /simulator/predict` (budget what-if)
- **`api/routes/recommend.py`** — `POST /recommend` (Bedrock AI layer, stubbed until Bedrock is wired)
- **`api/services/loader.py`** — Loads `.nc` files from local `models/` directory (S3 fallback path written but not yet active)
- **`api/services/inference.py`** — Extracts posteriors, HDIs, ROAS, saturation curves from InferenceData
- **`api/services/bedrock.py`** — Bedrock Claude Haiku stub (returns placeholder until IAM permissions confirmed)
- **`api/services/brand_config.py`** — Reads `datasets_config.json`
- All 6 endpoints tested and working locally at `localhost:8000`. Swagger UI at `/docs`.

### 3. React Frontend Skeleton
- **`frontend/src/App.jsx`** — Routing between views
- **`frontend/src/api.js`** — All fetch calls to FastAPI
- **`frontend/src/components/`** — 7 components wired to real API:
  - `DatasetSelector.jsx`, `PriorSliders.jsx`, `AttributionChart.jsx`
  - `SaturationCurves.jsx`, `BudgetSimulator.jsx`, `Recommendations.jsx`
- Tested locally at `localhost:3000`. No CSS / styling — Lovable handles all of that in the next phase.

### 4. Infrastructure Scripts
- **`setup_aws.sh`** — Billing alerts (SNS + CloudWatch at $50/$100/$150), S3 bucket creation, EC2 launch script. **Written but not yet executed** — awaiting IAM credentials.
- **`requirements.txt`** — Python dependencies locked.
- **`README.md`** — Full project documentation.

---

## Status: Not Yet Started

### 5. AWS Deployment (blocked on credentials)
AWS credentials not yet active. IAM Identity Center access to Cal Poly sandbox account is pending.

When credentials arrive:
1. Set `AWS_PROFILE` in `setup_aws.sh` to the profile name from `~/.aws/credentials`
2. Run `setup_aws.sh` — this provisions billing alerts, S3 bucket, EC2 instance
3. Upload the 9 `.nc` files from `models/` to `s3://mmm-project-inference-data/`
4. SSH into EC2, clone the repo, install requirements, start the FastAPI server
5. Switch `api/services/loader.py` from local file loading to S3 (`boto3` path is already written)
6. Configure API Gateway in front of EC2 (HTTP API, $3.50/million requests)
7. Wire Bedrock: confirm IAM role has `bedrock:InvokeModel` permission, then un-stub `api/services/bedrock.py`

### 6. Lovable UI Polish
After API Gateway URL is live:
1. Paste `frontend/src/` into Lovable with the prompt: _"Polish this React skeleton into a professional analytics dashboard. Do not change any API call logic, field names, or component structure."_
2. Lovable handles all CSS, layout, and visual design
3. Test that all API calls still hit the correct endpoints with correct field names

### 7. Final Hardening
- Lock CORS in `api/main.py` to the Lovable preview URL + final domain
- Add a `Dockerfile` for the FastAPI app (makes EC2 redeployment easier)
- Update this file

---

## Key Decisions (Locked — Do Not Change)

| Decision | Value | Why Locked |
|---|---|---|
| Brand IDs | `kova`, `poppa_bueno`, `nestwork` | Appear in `.nc` filenames, API responses, Lovable UI. Renaming = re-fitting 9 models. |
| Channel names | See `datasets_config.json` | Same — baked into `.nc` posterior variable names |
| API field names | See `agents.md` endpoint shapes | Lovable builds against these — changing them breaks the frontend |
| S3 bucket name | `mmm-project-inference-data` | Referenced in `loader.py` and `setup_aws.sh` |
| AWS region | `us-east-1` | All services must be in the same region; billing alarms require us-east-1 |
| Bedrock model | `anthropic.claude-haiku-20240307-v1:0` | Cost — keep `max_tokens=500`, `temperature=0.3` |
| Prior sigmas | 0.3 / 0.7 / 1.5 | Baked into fitted `.nc` files |

---

## AWS Cost Estimate (Sandbox Account Limits: $200 / 750 hrs)

| Service | Estimated Monthly Cost | Notes |
|---|---|---|
| EC2 t2.micro | ~$8.50 | 750 hr free tier; ~$0.0116/hr after |
| S3 (500 MB) | ~$0.01 | First 5 GB free |
| API Gateway (HTTP) | ~$0.00–$1.00 | $3.50/million requests |
| Bedrock (Haiku) | ~$0.50–$2.00 | Depends on traffic; keep max_tokens=500 |
| CloudWatch | $0.00 | 10 alarms free tier |
| **Total** | **~$10–$12/mo** | Well within $200 limit |

---

## Repository

GitHub: `https://github.com/bennrobinsonn/Bayesian-MMM-Dashboard`
Branch: `main`

---

## Resume Here (Next Session)

**Immediate next step:** Confirm AWS credentials are working, then run `setup_aws.sh`.

```bash
# Test credentials first:
aws sts get-caller-identity --profile YOUR_PROFILE_NAME

# If that works, run the setup script:
bash setup_aws.sh
```

Then follow steps 5–7 above in order.
