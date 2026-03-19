"""
api/main.py
-----------
FastAPI application entry point.

Start the server locally:
    uvicorn api.main:app --reload --port 8000

The --reload flag watches for file changes and restarts automatically —
useful during development. Remove it in production.

Once deployed to EC2, Uvicorn is started by a systemd service (configured
in setup_aws.sh). API Gateway sits in front and handles SSL termination.

Endpoints registered here:
    GET  /health                           → liveness check
    GET  /datasets                         → brand list from datasets_config.json
    GET  /model/results                    → channel attributions + credible intervals
    GET  /model/saturation                 → saturation curves per channel
    POST /simulator/predict                → budget reallocation what-if
    POST /recommend                        → Bedrock AI recommendation (stubbed)
"""

import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Route modules — each handles a logical slice of the API surface
from api.routes import model, simulator, recommend

# ── App instance ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="MMM Project API",
    description=(
        "Bayesian Marketing Mix Modeling dashboard backend. "
        "Serves pre-fit PyMC-Marketing posteriors for three brand scenarios."
    ),
    version="0.1.0",
    # /docs  → Swagger UI (interactive — test endpoints in the browser)
    # /redoc → ReDoc (cleaner read-only docs)
)

# ── CORS ───────────────────────────────────────────────────────────────────────
# NOTE: allow_origins=["*"] is incompatible with allow_credentials=True —
# browsers reject that combination. Origins must be listed explicitly when
# credentials are enabled.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://bayesian-mmm-dashboard.vercel.app",  # production frontend
        "http://localhost:3000",                        # local dev
        "http://localhost:5173",                        # Vite dev server
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# ── Register routers ───────────────────────────────────────────────────────────
# Each router is a FastAPI APIRouter defined in its own file.
# Prefixes keep the URL structure clean and match the API contract in agents.md.
app.include_router(model.router,     prefix="/model")
app.include_router(simulator.router, prefix="/simulator")
app.include_router(recommend.router)

# ── Config path ────────────────────────────────────────────────────────────────
REPO_ROOT   = Path(__file__).resolve().parent.parent
CONFIG_PATH = REPO_ROOT / "datasets_config.json"


# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/health", tags=["meta"])
def health() -> dict:
    """
    Liveness check for API Gateway and load balancer health probes.
    Returns 200 OK if the server is running.
    """
    return {"status": "ok", "version": app.version}


# ── Dataset listing ────────────────────────────────────────────────────────────
@app.get("/datasets", tags=["meta"])
def list_datasets() -> dict:
    """
    Returns the list of available brand scenarios and their metadata.

    Lovable's DatasetSelector component calls this on mount to populate
    the brand dropdown. Field names here are part of the fixed API contract
    — do not rename them after Lovable starts building against this.

    Response shape:
    {
      "brands": [
        {
          "id":          "kova",
          "name":        "Kova",
          "vertical":    "DTC / Performance",
          "channels":    ["Meta", "TikTok", "Paid_Search", "Email"],
          "description": "A DTC running watch brand..."
        },
        ...
      ]
    }
    """
    config = json.loads(CONFIG_PATH.read_text())
    brands_out = [
        {
            "id":          b["id"],
            "name":        b["name"],
            "vertical":    b["vertical"],
            "channels":    b["channels"],
            "description": b["description"],
        }
        for b in config["brands"]
    ]
    return {"brands": brands_out}
