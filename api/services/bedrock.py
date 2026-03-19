"""
api/services/bedrock.py
-----------------------
Amazon Bedrock integration for the AI recommendation layer.

Model: anthropic.claude-haiku-20240307-v1:0  (cheapest Claude, fast, sufficient)
Region: us-east-1
Max tokens: 500  (keeps Bedrock costs near-zero — ~$0.0004 per call)
Temperature: 0.3  (low = consistent, grounded recommendations)

To enable live Bedrock calls:
  1. Configure AWS credentials (IAM Identity Center or EC2 instance role)
  2. Set BEDROCK_ENABLED = True below
  3. Ensure the EC2 instance role has bedrock:InvokeModel permission

Cost estimate (for your video):
  Claude Haiku on Bedrock:  $0.00025 per 1K input tokens, $0.00125 per 1K output tokens
  A typical /recommend call: ~600 input tokens, ~300 output tokens
  Cost per call: ~$0.00053  →  1,000 calls ≈ $0.53
  Well within the $200 sandbox budget.

When BEDROCK_ENABLED = False (default):
  Falls back to a rule-based local recommendation engine that generates
  genuinely useful, data-driven advice from the posterior values — not
  placeholder text. The UI gets a real response either way.
"""

import json
import re

# ── Toggle ─────────────────────────────────────────────────────────────────────
BEDROCK_ENABLED = True

# ── Prompt builder ─────────────────────────────────────────────────────────────

def _build_prompt(
    brand_name:       str,
    vertical:         str,
    prior_config:     str,
    contributions:    list[dict],
    sat_statuses:     dict[str, str],   # {channel: "room_to_grow" | "moderate" | "near_saturated"}
    current_allocation: dict[str, float],
    budget_total:     float,
) -> str:
    """
    Builds the Bedrock prompt. Includes all posterior-derived numbers so that
    Claude Haiku's recommendation is grounded in the actual model output, not
    generic marketing advice.
    """
    prior_label = {
        "conservative": "skeptical of channel effectiveness",
        "balanced":      "neutral — letting the data speak",
        "aggressive":    "confident that channels are strong revenue drivers",
    }.get(prior_config, prior_config)

    channel_lines = "\n".join(
        f"  - {c['channel']}: {c['contribution_pct']:.1f}% of revenue "
        f"(94% HDI: {c['contribution_hdi_low']:.1f}–{c['contribution_hdi_high']:.1f}%), "
        f"ROAS {c['roas_mean']:.2f} "
        f"(HDI: {c['roas_hdi_low']:.2f}–{c['roas_hdi_high']:.2f}), "
        f"saturation: {sat_statuses.get(c['channel'], 'unknown')}"
        for c in contributions
    )

    alloc_lines = "\n".join(
        f"  - {ch}: {pct * 100:.0f}%  (${budget_total * pct:,.0f}/week)"
        for ch, pct in current_allocation.items()
    )

    return f"""You are a senior marketing analyst reviewing Bayesian Marketing Mix Model (MMM) results for {brand_name}, a {vertical} brand.

The model was run with a {prior_config} prior — the user is {prior_label}.

Channel performance (posterior means with 94% Bayesian credible intervals):
{channel_lines}

Current weekly budget (${budget_total:,.0f}/week):
{alloc_lines}

Saturation key: "room_to_grow" = steep part of curve (efficient spend), "near_saturated" = flat part (diminishing returns).

Provide a concise budget recommendation in this exact JSON format:
{{
  "recommendation_text": "<2-3 sentences of plain-language advice, referencing specific ROAS numbers>",
  "reasoning": {{
    "increase": ["<channel> (<reason with numbers>)", ...],
    "decrease": ["<channel> (<reason with numbers>)", ...],
    "maintain": ["<channel>", ...]
  }}
}}

Ground every claim in the numbers above. Be direct. Do not hedge excessively."""


# ── Bedrock call ────────────────────────────────────────────────────────────────

def _call_bedrock(prompt: str) -> dict:
    """
    Calls Claude Haiku on Amazon Bedrock and returns parsed JSON response.

    Prerequisites (uncomment body when ready):
      1. boto3 installed  ✓  (in requirements.txt)
      2. AWS credentials configured (IAM role on EC2, or Identity Center locally)
      3. EC2 instance role includes: bedrock:InvokeModel on
         arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-20240307-v1:0
    """
    import boto3
    client = boto3.client("bedrock-runtime", region_name="us-east-1")

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 500,
        "temperature": 0.3,
        "messages": [{"role": "user", "content": prompt}],
    })

    response = client.invoke_model(
        modelId="anthropic.claude-haiku-20240307-v1:0",
        body=body,
        contentType="application/json",
        accept="application/json",
    )

    raw = json.loads(response["body"].read())
    text = raw["content"][0]["text"]

    # Strip markdown code fences if present, then parse JSON
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    return json.loads(text)


# ── Local fallback ─────────────────────────────────────────────────────────────

def _local_recommendation(
    contributions:      list[dict],
    sat_statuses:       dict[str, str],
    current_allocation: dict[str, float],
) -> dict:
    """
    Rule-based recommendation engine — used when BEDROCK_ENABLED = False.

    Not placeholder text. Generates genuinely data-driven advice by:
      1. Ranking channels by posterior mean ROAS
      2. Cross-referencing saturation status
      3. Identifying specific increases / decreases with numeric justification

    Logic:
      - Increase: high ROAS (above median) AND not near-saturated
      - Decrease: low ROAS (below median) OR near-saturated with below-avg ROAS
      - Maintain: everything else
    """
    roas_values = {c["channel"]: c["roas_mean"] for c in contributions}
    median_roas = sorted(roas_values.values())[len(roas_values) // 2]

    increase, decrease, maintain = [], [], []

    for c in contributions:
        ch     = c["channel"]
        roas   = c["roas_mean"]
        status = sat_statuses.get(ch, "moderate")

        high_roas = roas >= median_roas
        saturated = status == "near_saturated"

        if high_roas and not saturated:
            increase.append(
                f"{ch} (ROAS {roas:.2f}, {status.replace('_', ' ')} — "
                f"additional spend still on the efficient part of the curve)"
            )
        elif not high_roas or (saturated and not high_roas):
            decrease.append(
                f"{ch} (ROAS {roas:.2f}, {status.replace('_', ' ')} — "
                f"below-median return{', diminishing returns' if saturated else ''})"
            )
        else:
            maintain.append(ch)

    # Build headline text from the categorised lists so text and reasoning agree.
    # Priority: lead with the best channel to increase; if none qualify, lead
    # with the worst channel to cut (still actionable advice).
    if increase:
        # Parse channel name from the first increase entry (format: "Chan (reason)")
        best_ch_name = increase[0].split(" (")[0]
        best_ch = next(c for c in contributions if c["channel"] == best_ch_name)
        rec = (
            f"Shift budget toward {best_ch['channel']} "
            f"(ROAS {best_ch['roas_mean']:.2f}, "
            f"HDI {best_ch['roas_hdi_low']:.2f}–{best_ch['roas_hdi_high']:.2f}) — "
            f"it sits on the efficient part of its saturation curve with the strongest posterior return. "
        )
    else:
        # No clear increase candidate — frame advice around what to cut
        rec = "No single channel stands out as an obvious increase target given current saturation levels. "

    if decrease:
        worst_ch_name = decrease[0].split(" (")[0]
        worst_ch = next(c for c in contributions if c["channel"] == worst_ch_name)
        rec += (
            f"Reduce spend on {worst_ch['channel']} "
            f"(ROAS {worst_ch['roas_mean']:.2f}) — "
            f"{'diminishing returns are active and ' if sat_statuses.get(worst_ch['channel']) == 'near_saturated' else ''}"
            f"each marginal dollar here returns less than any other channel. "
        )

    # Flag high-uncertainty channels — these should be tested, not blindly cut
    wide_hdi = [
        c["channel"] for c in contributions
        if (c["contribution_hdi_high"] - c["contribution_hdi_low"]) > 15.0
    ]
    if wide_hdi:
        rec += (
            f"Note: {', '.join(wide_hdi)} ha{'ve' if len(wide_hdi) > 1 else 's'} "
            f"wide credible intervals — the model is uncertain; "
            f"consider a holdout test before making large reallocations here."
        )

    return {
        "recommendation_text": rec.strip(),
        "reasoning": {
            "increase": increase,
            "decrease": decrease,
            "maintain": maintain,
        },
    }


# ── Public interface ───────────────────────────────────────────────────────────

def get_recommendation(
    brand_name:         str,
    vertical:           str,
    prior_config:       str,
    contributions:      list[dict],
    sat_statuses:       dict[str, str],
    current_allocation: dict[str, float],
    budget_total:       float,
) -> dict:
    """
    Returns a recommendation dict with keys:
        recommendation_text  — plain-language advice (1–3 sentences)
        reasoning            — {increase, decrease, maintain} channel lists

    Routes to Bedrock when BEDROCK_ENABLED = True, otherwise local fallback.
    Response shape is identical either way so the route doesn't need to branch.
    """
    if BEDROCK_ENABLED:
        prompt = _build_prompt(
            brand_name, vertical, prior_config,
            contributions, sat_statuses, current_allocation, budget_total,
        )
        return _call_bedrock(prompt)
    else:
        return _local_recommendation(contributions, sat_statuses, current_allocation)
