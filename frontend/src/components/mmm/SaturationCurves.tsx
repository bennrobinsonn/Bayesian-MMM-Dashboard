import { useState, useEffect, useMemo } from 'react';
import { fetchSaturationCurves } from '@/api';
import type { SaturationPoint } from '@/data/mockData';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';

const CHANNEL_COLORS: Record<string, string> = {
  'Meta': 'hsl(228, 66%, 47%)',
  'TikTok': 'hsl(173, 58%, 39%)',
  'Paid Search': 'hsl(262, 52%, 55%)',
  'Email': 'hsl(38, 92%, 50%)',
  'TV': 'hsl(346, 77%, 50%)',
  'OOH': 'hsl(28, 80%, 52%)',
  'Trade Promo': 'hsl(142, 52%, 42%)',
  'LinkedIn': 'hsl(210, 70%, 48%)',
  'Content/SEO': 'hsl(158, 60%, 40%)',
  'Webinars': 'hsl(280, 55%, 52%)',
};

function fmtSpend(v: number) {
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`;
  return `$${v}`;
}

function CurveCard({ channel, points }: { channel: string; points: SaturationPoint[] }) {
  const color = CHANNEL_COLORS[channel] ?? 'hsl(228, 66%, 47%)';
  
  // Find the approximate saturation point (where slope drops below threshold)
  const saturationIndex = useMemo(() => {
    for (let i = 1; i < points.length - 1; i++) {
      const slope = (points[i + 1].contribution_mean - points[i].contribution_mean) /
                    (points[i + 1].spend - points[i].spend + 1);
      const initialSlope = (points[1].contribution_mean - points[0].contribution_mean) /
                           (points[1].spend - points[0].spend + 1);
      if (slope < initialSlope * 0.15) return i;
    }
    return points.length - 1;
  }, [points]);

  const saturationPct = Math.round((saturationIndex / points.length) * 100);
  const status = saturationPct < 40 ? 'Near saturation' : saturationPct < 70 ? 'Moderate headroom' : 'Room to grow';
  const statusColor = saturationPct < 40 ? 'text-chart-5' : saturationPct < 70 ? 'text-chart-4' : 'text-chart-3';

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{channel}</h3>
        <span className={`text-[10px] font-medium ${statusColor} bg-muted px-2 py-0.5 rounded-full`}>
          {status}
        </span>
      </div>

      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`gradient-${channel}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" vertical={false} />
            <XAxis
              dataKey="spend"
              tickFormatter={fmtSpend}
              tick={{ fontSize: 10, fill: 'hsl(220, 10%, 46%)' }}
              axisLine={{ stroke: 'hsl(220, 13%, 91%)' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(220, 10%, 46%)' }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-card border border-border rounded-lg p-2 shadow-lg text-xs">
                    <div className="font-mono text-foreground">Spend: {fmtSpend(d.spend)}</div>
                    <div className="font-mono text-foreground">Contribution: {d.contribution_mean.toFixed(1)}</div>
                    <div className="font-mono text-muted-foreground">
                      94% HDI: {d.hdi_low.toFixed(1)}–{d.hdi_high.toFixed(1)}
                    </div>
                  </div>
                );
              }}
            />
            {/* HDI band */}
            <Area
              type="monotone"
              dataKey="hdi_high"
              stroke="none"
              fill={color}
              fillOpacity={0.08}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="hdi_low"
              stroke="none"
              fill="hsl(var(--card))"
              fillOpacity={1}
              isAnimationActive={false}
            />
            {/* Mean curve */}
            <Area
              type="monotone"
              dataKey="contribution_mean"
              stroke={color}
              strokeWidth={2}
              fill={`url(#gradient-${channel})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface SaturationCurvesProps {
  brand: string;
  priors: string;
}

export default function SaturationCurves({ brand, priors }: SaturationCurvesProps) {
  const [data, setData] = useState<{ curves: Record<string, SaturationPoint[]> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError(null);
    fetchSaturationCurves(brand, priors)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [brand, priors]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 h-[240px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) return <div className="text-destructive text-sm">Error: {error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Saturation Curves</h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
          Each curve shows how a channel's contribution to revenue changes as you increase spend.
          The <span className="font-semibold text-foreground/80">shaded band</span> represents the model's uncertainty about the curve shape. 
          wider bands mean less confidence in the response function. 
          When the curve flattens, you've hit <span className="font-semibold text-foreground/80">diminishing returns</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(data.curves).map(([channel, points]) => (
          <CurveCard key={channel} channel={channel} points={points} />
        ))}
      </div>
    </div>
  );
}
