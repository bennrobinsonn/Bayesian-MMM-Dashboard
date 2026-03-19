import { useState } from 'react';
import { predictBudget } from '@/api';
import type { SimulationResult } from '@/data/mockData';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Minus, Play, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BudgetSimulatorProps {
  brand: string;
  priors: string;
  channels: string[];
  weights: Record<string, number>;
  allocation: Record<string, number>;
  onWeightsChange: (weights: Record<string, number>) => void;
}

const fmt = (n: number) => Math.round(n).toLocaleString();
const sign = (n: number) => (n >= 0 ? '+' : '');

const CHANNEL_COLORS = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
];

export default function BudgetSimulator({ brand, priors, channels, weights, allocation, onWeightsChange }: BudgetSimulatorProps) {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSlider = (channel: string, rawValue: number) => {
    onWeightsChange({ ...weights, [channel]: rawValue });
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

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5 h-full flex flex-col">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Budget Simulator</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Drag sliders to reallocate spend across channels. Percentages always sum to 100%. 
          The model predicts revenue using the same Bayesian posterior — the result includes a 
          <span className="font-semibold text-foreground/80"> credible interval</span> showing the range of plausible outcomes.
        </p>
      </div>

      {/* Sliders */}
      <div className="space-y-3 flex-1">
        {channels.map((ch, i) => {
          const displayPct = allocation[ch] != null
            ? (allocation[ch] * 100).toFixed(1)
            : '0.0';
          return (
            <div key={ch} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn('h-2.5 w-2.5 rounded-sm', CHANNEL_COLORS[i % CHANNEL_COLORS.length])} />
                  <span className="text-sm font-medium text-foreground">{ch}</span>
                </div>
                <span className="text-sm font-mono font-semibold text-foreground">{displayPct}%</span>
              </div>
              <Slider
                value={[weights[ch] ?? 0]}
                min={0}
                max={100}
                step={1}
                onValueChange={([v]) => handleSlider(ch, v)}
                className="cursor-pointer"
              />
            </div>
          );
        })}
      </div>

      {/* Run button */}
      <Button
        onClick={handleSimulate}
        disabled={loading}
        className="w-full"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Simulating…
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            Run Simulation
          </>
        )}
      </Button>

      {error && (
        <div className="text-destructive text-xs bg-destructive/10 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4 animate-fade-in">
          {/* Hero number: predicted revenue */}
          <div className="bg-muted/50 rounded-xl p-5 text-center space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Predicted Weekly Revenue</p>
            <p className="text-4xl font-bold font-mono text-foreground tracking-tight animate-count-up">
              ${fmt(result.predicted_revenue_mean)}
            </p>
            <p className="text-xs font-mono text-muted-foreground">
              94% HDI: ${fmt(result.predicted_revenue_hdi_low)} – ${fmt(result.predicted_revenue_hdi_high)}
            </p>
          </div>

          {/* Delta */}
          <div className="flex items-center justify-center gap-3">
            <div className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold font-mono',
              result.delta_mean >= 0
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            )}>
              {result.delta_mean >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {sign(result.delta_mean)}${fmt(Math.abs(result.delta_mean))}
            </div>
            <span className={cn(
              'text-xs font-mono font-semibold',
              result.delta_pct >= 0 ? 'text-success' : 'text-destructive'
            )}>
              ({sign(result.delta_pct)}{result.delta_pct.toFixed(1)}%)
            </span>
            <span className="text-xs text-muted-foreground">vs current ${fmt(result.current_revenue_mean)}/wk</span>
          </div>

          {/* Proposed spend breakdown */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Proposed Weekly Spend</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(result.proposed_spend_per_channel).map(([ch, spend]) => (
                <div key={ch} className="flex justify-between text-xs py-0.5">
                  <span className="text-muted-foreground">{ch}</span>
                  <span className="font-mono font-medium text-foreground">${fmt(spend)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
