"""
api/services/brand_config.py
----------------------------
Thin wrapper around datasets_config.json for use inside the API.

Routes should call get_brand_channels() rather than parsing the JSON
themselves — keeps config access in one place and makes it easy to
add caching or validation later.
"""

import json
from functools import lru_cache
from pathlib import Path

REPO_ROOT   = Path(__file__).resolve().parent.parent.parent
CONFIG_PATH = REPO_ROOT / "datasets_config.json"


@lru_cache(maxsize=1)
def _load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text())


def get_brand_channels(brand_id: str) -> list[str]:
    """Returns the ordered channel list for a brand, as defined in datasets_config.json."""
    config  = _load_config()
    brands  = {b["id"]: b for b in config["brands"]}
    if brand_id not in brands:
        raise ValueError(
            f"Unknown brand '{brand_id}'. Valid: {sorted(brands.keys())}"
        )
    return brands[brand_id]["channels"]
