import { useState, useEffect } from 'react';
import { fetchModelResults } from '@/api';
import type { ChannelContribution, ModelFit } from '@/data/mockData';
import { Info } from 'lucide-react';

const CHANNEL_COLORS = [
  'hsl(228, 66%, 47%)',  // chart-1
  'hsl(262, 52%, 55%)',  // chart-2
  'hsl(173, 58%, 39%)',  // chart-3
  'hsl(38, 92%, 50%)',   // chart-4
  'hsl(346, 77%, 50%)',  // chart-5
];

interface AttributionChartProps {
  brand: string;
  priors: string;
}

function ModelFitBadge({ fit }: { fit: ModelFit }) {
  return (
    <div className="flex items-center gap-4 text-xs font-mono">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">R²</span>
        <span className="font-semibold text-foreground">{fit.r_squared.toFixed(2)}</span>
      </div>
      <div className="h-3 w-px bg-border" />
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">RMSE</span>
        <span className="font-semibold text-foreground">${fit.rmse.toLocaleString()}</span>
      </div>
      <div className="h-3 w-px bg-border" />
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Obs</span>
        <span className="font-semibold text-foreground">{fit.n_obs} weeks</span>
      </div>
    </div>
  );
}

function ContributionBar({ ch, index, maxPct }: { ch: ChannelContribution; index: number; maxPct: number }) {
  const barWidthPct = (ch.contribution_pct / maxPct) * 100;
  const hdiLowPct = (ch.contribution_hdi_low / maxPct) * 100;
  const hdiHighPct = (ch.contribution_hdi_high / maxPct) * 100;
  const color = CHANNEL_COLORS[index % CHANNEL_COLORS.length];

  return (
    <div className="group relative">
      <div className="flex items-center gap-3 py-2.5">
        {/* Channel name */}
        <div className="w-28 shrink-0 text-right">
          <span className="text-sm font-medium text-foreground">{ch.channel}</span>
        </div>

        {/* Bar area */}
        <div className="flex-1 relative h-9">
          {/* Background track */}
          <div className="absolute inset-0 bg-muted/50 rounded" />
          
          {/* Contribution bar */}
          <div
            className="absolute top-1 bottom-1 left-0 rounded transition-all duration-500"
            style={{ width: `${barWidthPct}%`, backgroundColor: color, opacity: 0.85 }}
          />

          {/* HDI error bar */}
          <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `${hdiLowPct}%`, width: `${hdiHighPct - hdiLowPct}%` }}>
            <div className="h-[2px] w-full bg-foreground/70" />
            {/* End caps */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3 bg-foreground/70" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[2px] h-3 bg-foreground/70" />
          </div>
        </div>

        {/* Stats */}
        <div className="w-44 shrink-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold font-mono text-foreground">{ch.contribution_pct}%</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              [{ch.contribution_hdi_low}–{ch.contribution_hdi_high}]
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            ROAS {ch.roas_mean.toFixed(2)}
            <span className="ml-1">[{ch.roas_hdi_low.toFixed(2)}–{ch.roas_hdi_high.toFixed(2)}]</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AttributionChart({ brand, priors }: AttributionChartProps) {
  const [data, setData] = useState<{ channel_contributions: ChannelContribution[]; model_fit: ModelFit } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError(null);
    fetchModelResults(brand, priors)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [brand, priors]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mb-4" />
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-28 h-4 bg-muted rounded" />
              <div className="flex-1 h-9 bg-muted rounded" />
              <div className="w-44 h-8 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) return <div className="text-destructive text-sm p-4">Error: {error}</div>;
  if (!data) return null;

  const maxPct = Math.max(...data.channel_contributions.map(c => c.contribution_hdi_high));

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Channel Attribution</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-md leading-relaxed">
            Each bar shows what percentage of revenue the model attributes to each channel. 
            The horizontal lines are <span className="font-semibold text-foreground/80">94% credible intervals</span>, meaning
            there's a 94% probability the true contribution falls within that range.
          </p>
        </div>
        <ModelFitBadge fit={data.model_fit} />
      </div>

      <div className="space-y-0.5">
        {data.channel_contributions.map((ch, i) => (
          <ContributionBar key={ch.channel} ch={ch} index={i} maxPct={maxPct} />
        ))}
      </div>

      {/* Inline legend */}
      <div className="flex items-center gap-4 pt-2 border-t border-border">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <div className="w-6 h-2.5 rounded bg-primary/60" />
          <span>Posterior mean contribution</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <div className="flex items-center">
            <div className="w-[2px] h-2.5 bg-foreground/60" />
            <div className="w-4 h-[2px] bg-foreground/60" />
            <div className="w-[2px] h-2.5 bg-foreground/60" />
          </div>
          <span>94% HDI, range of plausible true values</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Info className="h-3 w-3" />
          <span>Wider interval = more model uncertainty</span>
        </div>
      </div>
    </div>
  );
}
