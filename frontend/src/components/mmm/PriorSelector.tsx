import { cn } from '@/lib/utils';
import { PRIOR_PERSONAS, type PriorPersona } from '@/data/mockData';

const PRIOR_DEFAULTS: PriorPersona = {
  conservative: { role: 'The Skeptic', quote: '"Show me the data before I believe anything."' },
  balanced: { role: 'Data-Neutral', quote: '"No strong opinions. Let the model tell me what\'s working."' },
  aggressive: { role: 'The Believer', quote: '"I know these channels work. I\'ve seen it firsthand."' },
};

const PRIOR_META = [
  { value: 'conservative' as const, label: 'Conservative', sigma: 'σ = 0.3', tone: 'text-chart-3' },
  { value: 'balanced' as const, label: 'Balanced', sigma: 'σ = 0.7', tone: 'text-chart-1' },
  { value: 'aggressive' as const, label: 'Aggressive', sigma: 'σ = 1.5', tone: 'text-chart-5' },
];

interface PriorSelectorProps {
  value: string;
  onChange: (value: string) => void;
  brand?: string | null;
}

export default function PriorSelector({ value, onChange, brand }: PriorSelectorProps) {
  const personas = (brand && PRIOR_PERSONAS[brand]) ? PRIOR_PERSONAS[brand] : PRIOR_DEFAULTS;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">Prior Belief</h3>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-mono">
          Bayesian prior
        </span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
        How much do you believe marketing channels drive revenue before seeing the data? 
        This shapes the model's starting assumptions. A tighter prior requires stronger evidence to move.
      </p>

      <div className="grid grid-cols-3 gap-2">
        {PRIOR_META.map(opt => {
          const persona = personas[opt.value];
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={cn(
                'group relative flex flex-col items-start p-3 rounded-lg border text-left transition-all duration-200',
                value === opt.value
                  ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/20'
                  : 'border-border bg-card hover:border-primary/30 hover:bg-primary/[0.02]'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  'text-sm font-semibold',
                  value === opt.value ? 'text-primary' : 'text-foreground'
                )}>
                  {opt.label}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {opt.sigma}
                </span>
              </div>
              <p className="text-[10px] font-medium text-foreground/70 mb-0.5">
                {persona.role}
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug italic">
                {persona.quote}
              </p>
              {value === opt.value && (
                <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
