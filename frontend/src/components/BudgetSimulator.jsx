/**
 * BudgetSimulator.jsx
 * -------------------
 * Budget reallocation what-if tool. Sliders control spend weights per channel.
 * On "Run Simulation", calls POST /simulator/predict and shows predicted revenue
 * vs current, with a 94% HDI credible interval on the prediction.
 *
 * Slider design:
 *   Each slider controls a raw weight (0–100). The actual allocation fraction
 *   is weight / sum(all weights), computed in App.jsx. This means:
 *     - Moving one slider doesn't force the others to change
 *     - Displayed percentages always sum to 100%
 *     - Moving a slider to 0 removes that channel from the allocation
 *
 * This component receives:
 *   channels          — ordered list of channel names for this brand
 *   weights           — { [channel]: rawSliderValue }  (controlled by App)
 *   allocation        — { [channel]: fraction }        (normalised, computed in App)
 *   onWeightsChange   — App's setWeights setter
 *
 * Prediction result shape from /simulator/predict:
 *   { predicted_revenue_mean, predicted_revenue_hdi_low, predicted_revenue_hdi_high,
 *     current_revenue_mean, delta_mean, delta_pct, proposed_spend_per_channel }
 */

import { useState } from 'react';
import { predictBudget } from '../api';

function BudgetSimulator({ brand, priors, channels, weights, allocation, onWeightsChange }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSlider = (channel, rawValue) => {
    onWeightsChange({ ...weights, [channel]: Number(rawValue) });
    // Clear stale result when allocation changes
    setResult(null);
  };

  const handleSimulate = () => {
    setLoading(true);
    setError(null);
    predictBudget(brand, priors, allocation)
      .then(setResult)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  const fmt  = n => Math.round(n).toLocaleString();
  const sign = n => n >= 0 ? '+' : '';

  return (
    <div>
      <h2>Budget Simulator</h2>
      <p>
        Drag sliders to reallocate spend across channels.
        Percentages are normalised to sum to 100% automatically.
        Click <strong>Run Simulation</strong> to see predicted revenue
        with a 94% HDI credible interval.
      </p>

      {/* Allocation sliders — one per channel */}
      {channels.map(ch => {
        const displayPct = allocation[ch] != null
          ? (allocation[ch] * 100).toFixed(1)
          : '0.0';
        return (
          <div key={ch}>
            <label htmlFor={`slider-${ch}`}>
              {ch}: {displayPct}%
            </label>
            <input
              id={`slider-${ch}`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={weights[ch] ?? 0}
              onChange={e => handleSlider(ch, e.target.value)}
            />
          </div>
        );
      })}

      <button onClick={handleSimulate} disabled={loading}>
        {loading ? 'Simulating...' : 'Run Simulation'}
      </button>

      {error && <div>Error: {error}</div>}

      {result && (
        <div>
          <p>Current revenue (mean): ${fmt(result.current_revenue_mean)} / week</p>
          <p>Predicted revenue (mean): ${fmt(result.predicted_revenue_mean)} / week</p>
          <p>
            94% HDI: ${fmt(result.predicted_revenue_hdi_low)} – ${fmt(result.predicted_revenue_hdi_high)}
          </p>
          <p>
            Delta: {sign(result.delta_mean)}${fmt(result.delta_mean)} ({sign(result.delta_pct)}{result.delta_pct.toFixed(1)}%)
          </p>

          <div>
            <strong>Proposed weekly spend by channel:</strong>
            {Object.entries(result.proposed_spend_per_channel).map(([ch, spend]) => (
              <div key={ch}>{ch}: ${fmt(spend)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default BudgetSimulator;
