/**
 * SaturationCurves.jsx
 * --------------------
 * Fetches /model/saturation and renders one S-curve per channel.
 *
 * Each curve shows the LogisticSaturation response:
 *   x-axis → weekly spend in dollars (from $0 to 1.5× max observed)
 *   y-axis → expected channel contribution (posterior mean)
 *   shaded band → 94% HDI credible interval on the curve shape
 *
 * Reading the chart:
 *   Steep slope = efficient spend, room to grow
 *   Flat slope  = diminishing returns, channel is near saturation
 *   Wide band   = model uncertainty about the saturation shape
 *
 * Data shape from /model/saturation:
 *   curves: { [channel]: [{ spend, contribution_mean, hdi_low, hdi_high }] }
 *   50 points per channel, spend ranges from 0 to 1.5× max observed.
 *
 * Re-fetches whenever brand or priors changes.
 */

import { useState, useEffect } from 'react';
import { fetchSaturationCurves } from '../api';

// SVG dimensions per chart — Lovable will replace these entirely
const W = 300;
const H = 200;
const PAD = { top: 10, right: 10, bottom: 30, left: 40 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

function CurveChart({ channel, points }) {
  const maxSpend  = points[points.length - 1].spend;
  const maxContrib = Math.max(...points.map(p => p.hdi_high), 1e-9);

  const toX = spend   => PAD.left + (spend   / maxSpend)   * INNER_W;
  const toY = contrib => PAD.top  + INNER_H - (contrib / maxContrib) * INNER_H;

  // SVG polygon path for the HDI band (up along hdi_low, back along hdi_high)
  const bandPath = [
    ...points.map((p, i)  => `${i === 0 ? 'M' : 'L'} ${toX(p.spend)} ${toY(p.hdi_low)}`),
    ...points.slice().reverse().map(p => `L ${toX(p.spend)} ${toY(p.hdi_high)}`),
    'Z',
  ].join(' ');

  // SVG polyline path for the posterior mean curve
  const meanPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.spend)} ${toY(p.contribution_mean)}`)
    .join(' ');

  // Axis tick labels — just min and max
  const fmtSpend = v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`;

  return (
    <div>
      <h3>{channel}</h3>
      <svg width={W} height={H}>
        {/* HDI band */}
        <path d={bandPath} fill="rgba(0,0,0,0.12)" stroke="none" />

        {/* Mean saturation curve */}
        <path d={meanPath} fill="none" stroke="#222" strokeWidth={2} />

        {/* X axis */}
        <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="#888" />
        <text x={PAD.left}          y={H - PAD.bottom + 14} fontSize={9} textAnchor="middle">{fmtSpend(0)}</text>
        <text x={W - PAD.right}     y={H - PAD.bottom + 14} fontSize={9} textAnchor="middle">{fmtSpend(maxSpend)}</text>
        <text x={W / 2}             y={H - 2}               fontSize={9} textAnchor="middle">Weekly spend</text>

        {/* Y axis */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="#888" />
        <text
          x={12} y={H / 2}
          fontSize={9} textAnchor="middle"
          transform={`rotate(-90, 12, ${H / 2})`}
        >
          Contribution
        </text>
      </svg>
    </div>
  );
}

function SaturationCurves({ brand, priors }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError(null);
    fetchSaturationCurves(brand, priors)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [brand, priors]);

  if (loading) return <div>Loading saturation curves...</div>;
  if (error)   return <div>Error loading saturation curves: {error}</div>;
  if (!data)   return null;

  return (
    <div>
      <h2>Saturation Curves</h2>
      <p>
        Each curve shows diminishing returns as spend increases. The shaded band
        is the 94% HDI — uncertainty about the shape of the curve itself.
        A channel on the flat part of its curve is near saturation.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
        {Object.entries(data.curves).map(([channel, points]) => (
          <CurveChart key={channel} channel={channel} points={points} />
        ))}
      </div>
    </div>
  );
}

export default SaturationCurves;
