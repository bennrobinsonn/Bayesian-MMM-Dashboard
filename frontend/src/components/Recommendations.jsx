/**
 * Recommendations.jsx
 * -------------------
 * Calls POST /recommend and displays AI-generated budget advice grounded in
 * the actual posterior values (ROAS, HDI, saturation status).
 *
 * The recommendation is triggered manually (button press) rather than
 * automatically, because:
 *   1. It's a deliberate action — the user is asking for advice
 *   2. When Bedrock is enabled it incurs a small API cost per call
 *   3. It reads the current allocation from the BudgetSimulator, so the user
 *      should set their allocation before requesting advice
 *
 * Response shape from /recommend:
 *   recommendation_text   — plain-language 2–3 sentence advice
 *   suggested_allocation  — { [channel]: fraction } — what the model suggests
 *   reasoning             — { increase: [], decrease: [], maintain: [] }
 *   channel_context       — { [channel]: { roas_mean, saturation_status, ... } }
 *   bedrock_enabled       — bool — whether the response came from Claude Haiku
 *
 * Props:
 *   brand      — active brand ID
 *   priors     — active prior config
 *   allocation — current normalised allocation from App (derived from BudgetSimulator weights)
 */

import { useState } from 'react';
import { fetchRecommendation } from '../api';

function Recommendations({ brand, priors, allocation }) {
  const [rec, setRec] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFetch = () => {
    setLoading(true);
    setError(null);
    fetchRecommendation(brand, priors, allocation)
      .then(setRec)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <h2>AI Budget Recommendation</h2>
      <p>
        Grounded in the posterior ROAS values, HDI credible intervals, and
        saturation status per channel. Set your allocation in the Budget Simulator
        above, then click below to get advice.
      </p>

      <button onClick={handleFetch} disabled={loading}>
        {loading ? 'Generating recommendation...' : 'Get Recommendation'}
      </button>

      {error && <div>Error: {error}</div>}

      {rec && (
        <div>
          {/* Plain-language advice */}
          <p>{rec.recommendation_text}</p>

          {/* Suggested allocation */}
          <div>
            <strong>Suggested allocation:</strong>
            {Object.entries(rec.suggested_allocation).map(([ch, frac]) => (
              <div key={ch}>{ch}: {(frac * 100).toFixed(1)}%</div>
            ))}
          </div>

          {/* Reasoning breakdown */}
          {rec.reasoning.increase.length > 0 && (
            <div>
              <strong>Increase:</strong>
              {rec.reasoning.increase.map((item, i) => <div key={i}>{item}</div>)}
            </div>
          )}
          {rec.reasoning.decrease.length > 0 && (
            <div>
              <strong>Decrease:</strong>
              {rec.reasoning.decrease.map((item, i) => <div key={i}>{item}</div>)}
            </div>
          )}
          {rec.reasoning.maintain.length > 0 && (
            <div>
              <strong>Maintain:</strong>
              {rec.reasoning.maintain.join(', ')}
            </div>
          )}

          {/* Channel context — ROAS + saturation per channel */}
          <div>
            <strong>Channel context:</strong>
            {Object.entries(rec.channel_context).map(([ch, ctx]) => (
              <div key={ch}>
                {ch} — ROAS {ctx.roas_mean} (HDI {ctx.roas_hdi_low}–{ctx.roas_hdi_high}) |{' '}
                {ctx.contribution_pct}% of revenue | {ctx.saturation_status.replace(/_/g, ' ')}
              </div>
            ))}
          </div>

          {/* Source indicator */}
          <p>
            <em>
              {rec.bedrock_enabled
                ? 'Powered by Claude Haiku on Amazon Bedrock'
                : 'Rule-based engine (Bedrock pending AWS credential setup)'}
            </em>
          </p>
        </div>
      )}
    </div>
  );
}

export default Recommendations;
