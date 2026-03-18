/**
 * AttributionChart.jsx
 * --------------------
 * Fetches /model/results and renders channel attribution as a horizontal bar
 * chart with 94% HDI error bars.
 *
 * The bars show posterior mean contribution %. The error bars show the HDI —
 * "there is 94% probability this channel's true contribution lies in this range."
 * Wide bars = the model is uncertain about this channel.
 *
 * Also displays model fit stats (R², RMSE) and ROAS per channel.
 *
 * Data shape from /model/results:
 *   channel_contributions: [{
 *     channel, contribution_pct,
 *     contribution_hdi_low, contribution_hdi_high,
 *     roas_mean, roas_hdi_low, roas_hdi_high
 *   }]
 *   model_fit: { r_squared, rmse, n_obs }
 *
 * Re-fetches whenever brand or priors changes.
 */

import { useState, useEffect } from 'react';
import { fetchModelResults } from '../api';

// Chart layout constants — Lovable will replace the SVG entirely
const SVG_W = 640;
const BAR_H = 28;
const ROW_H = 56;
const LABEL_W = 120;
const BAR_AREA_W = 320;
const PAD_TOP = 10;

function AttributionChart({ brand, priors }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError(null);
    fetchModelResults(brand, priors)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [brand, priors]);

  if (loading) return <div>Loading attribution...</div>;
  if (error)   return <div>Error loading attribution: {error}</div>;
  if (!data)   return null;

  const contributions = data.channel_contributions;
  const maxPct = Math.max(...contributions.map(c => c.contribution_hdi_high));
  const toX = pct => LABEL_W + (pct / maxPct) * BAR_AREA_W;
  const svgH = contributions.length * ROW_H + PAD_TOP;

  return (
    <div>
      <h2>Channel Attribution</h2>

      <p>
        Model fit — R²: {data.model_fit.r_squared} | RMSE: {data.model_fit.rmse.toLocaleString()} | n={data.model_fit.n_obs} weeks
      </p>
      <p>
        Error bars show the 94% HDI credible interval — the range where there is
        94% posterior probability the true contribution lies.
      </p>

      <svg width={SVG_W} height={svgH}>
        {contributions.map((ch, i) => {
          const barW    = (ch.contribution_pct / maxPct) * BAR_AREA_W;
          const hdiLowX = toX(ch.contribution_hdi_low);
          const hdiHiX  = toX(ch.contribution_hdi_high);
          const barX    = LABEL_W;
          const midY    = PAD_TOP + i * ROW_H + BAR_H / 2;
          const barY    = PAD_TOP + i * ROW_H;

          return (
            <g key={ch.channel}>
              {/* Channel name */}
              <text x={LABEL_W - 6} y={midY + 5} textAnchor="end" fontSize={13}>
                {ch.channel}
              </text>

              {/* Contribution bar */}
              <rect x={barX} y={barY} width={barW} height={BAR_H} fill="#4a4a4a" />

              {/* HDI error bar — horizontal line */}
              <line x1={hdiLowX} y1={midY} x2={hdiHiX} y2={midY} stroke="#111" strokeWidth={2} />
              {/* HDI end caps */}
              <line x1={hdiLowX} y1={midY - 6} x2={hdiLowX} y2={midY + 6} stroke="#111" strokeWidth={2} />
              <line x1={hdiHiX}  y1={midY - 6} x2={hdiHiX}  y2={midY + 6} stroke="#111" strokeWidth={2} />

              {/* Stats label */}
              <text x={toX(ch.contribution_hdi_high) + 8} y={barY + 14} fontSize={11}>
                {ch.contribution_pct}% [{ch.contribution_hdi_low}–{ch.contribution_hdi_high}]
              </text>
              <text x={toX(ch.contribution_hdi_high) + 8} y={barY + 28} fontSize={11}>
                ROAS {ch.roas_mean} [{ch.roas_hdi_low}–{ch.roas_hdi_high}]
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default AttributionChart;
