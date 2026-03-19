import { useState } from 'react';
import { fetchRecommendation } from '@/api';
import type { RecommendationResult } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecommendationsProps {
  brand: string;
  priors: string;
  allocation: Record<string, number>;
}

function SaturationBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  const isNear = status === 'near_saturation';
  const isHigh = status === 'high_headroom';
  return (
    <span className={cn(
      'text-[9px] font-medium px-1.5 py-0.5 rounded-full capitalize',
      isNear ? 'bg-chart-5/10 text-chart-5' : isHigh ? 'bg-chart-3/10 text-chart-3' : 'bg-chart-4/10 text-chart-4'
    )}>
      {label}
    </span>
  );
}

export default function Recommendations({ brand, priors, allocation }: RecommendationsProps) {
  const [rec, setRec] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = () => {
    setLoading(true);
    setError(null);
    fetchRecommendation(brand, priors, allocation)
      .then(setRec)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5 h-full flex flex-col">
      <div>
        <h2 className="text-lg font-semibold text-foreground">AI Recommendations</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Grounded in the posterior ROAS, credible intervals, and saturation status for each channel.
          Set your allocation in the simulator, then generate a recommendation.
        </p>
      </div>

      <Button
        onClick={handleFetch}
        disabled={loading}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating Recommendation…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Get AI Recommendation
          </>
        )}
      </Button>

      {error && (
        <div className="text-destructive text-xs bg-destructive/10 rounded-lg p-3">{error}</div>
      )}

      {rec && (
        <div className="space-y-5 animate-fade-in flex-1 overflow-auto">
          {/* Main advice */}
          <div className="bg-primary/[0.04] border border-primary/10 rounded-lg p-4">
            <p className="text-sm text-foreground leading-relaxed">{rec.recommendation_text}</p>
          </div>

          {/* Reasoning */}
          <div className="space-y-3">
            {rec.reasoning.increase.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <ArrowUp className="h-3.5 w-3.5 text-success" />
                  <span className="text-xs font-semibold text-success uppercase tracking-wider">Increase</span>
                </div>
                {rec.reasoning.increase.map((item, i) => (
                  <p key={i} className="text-xs text-muted-foreground leading-relaxed pl-5">{item}</p>
                ))}
              </div>
            )}
            {rec.reasoning.decrease.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <ArrowDown className="h-3.5 w-3.5 text-chart-5" />
                  <span className="text-xs font-semibold text-chart-5 uppercase tracking-wider">Decrease</span>
                </div>
                {rec.reasoning.decrease.map((item, i) => (
                  <p key={i} className="text-xs text-muted-foreground leading-relaxed pl-5">{item}</p>
                ))}
              </div>
            )}
            {rec.reasoning.maintain.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Maintain</span>
                <span className="text-xs text-muted-foreground">{rec.reasoning.maintain.join(', ')}</span>
              </div>
            )}
          </div>

          {/* Suggested allocation */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Suggested Allocation</p>
            <div className="flex rounded-lg overflow-hidden h-3">
              {Object.entries(rec.suggested_allocation).map(([ch, frac], i) => (
                <div
                  key={ch}
                  className={cn(COLORS[i % COLORS.length])}
                  style={{ width: `${frac * 100}%` }}
                  title={`${ch}: ${(frac * 100).toFixed(1)}%`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(rec.suggested_allocation).map(([ch, frac]) => (
                <div key={ch} className="flex justify-between text-xs py-0.5">
                  <span className="text-muted-foreground">{ch}</span>
                  <span className="font-mono font-medium text-foreground">{(frac * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Channel context */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Channel Context</p>
            <div className="space-y-2">
              {Object.entries(rec.channel_context).map(([ch, ctx]) => (
                <div key={ch} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                  <span className="font-medium text-foreground">{ch}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-muted-foreground">
                      ROAS {ctx.roas_mean.toFixed(2)}
                      <span className="text-[10px] ml-1">[{ctx.roas_hdi_low.toFixed(2)}–{ctx.roas_hdi_high.toFixed(2)}]</span>
                    </span>
                    <span className="font-mono text-muted-foreground">{ctx.contribution_pct}%</span>
                    <SaturationBadge status={ctx.saturation_status} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Source */}
          <p className="text-[10px] text-muted-foreground italic">
            {rec.bedrock_enabled
              ? 'Powered by Nova Micro on Amazon Bedrock'
              : 'Rule-based engine (Bedrock pending AWS credential setup)'}
          </p>
        </div>
      )}
    </div>
  );
}

const COLORS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];
