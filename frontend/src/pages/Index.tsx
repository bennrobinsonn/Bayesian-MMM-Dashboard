import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { MOCK_BRANDS, type BrandMeta } from '@/data/mockData';
import PriorSelector from '@/components/mmm/PriorSelector';
import AttributionChart from '@/components/mmm/AttributionChart';
import SaturationCurves from '@/components/mmm/SaturationCurves';
import BudgetSimulator from '@/components/mmm/BudgetSimulator';
import Recommendations from '@/components/mmm/Recommendations';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import kovaLogo from '@/assets/Kova_Logo.png';
import nestworkLogo from '@/assets/Nestwork_Logo.png';
import poppaLogo from '@/assets/Poppa_Bueno_Logo.jpg';

const brandLogos: Record<string, string> = {
  kova: kovaLogo,
  'poppa_bueno': poppaLogo,
  nestwork: nestworkLogo,
};

const BRAND_TAGS: Record<string, string> = {
  kova: 'DTC',
  'poppa_bueno': 'CPG',
  nestwork: 'B2B SaaS',
};

export default function Index() {
  const [brand, setBrand] = useState<string | null>(null);
  const [brandMeta, setBrandMeta] = useState<BrandMeta | null>(null);
  const [priors, setPriors] = useState<string | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});

  const allocation = (() => {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    if (total === 0) return {};
    return Object.fromEntries(
      Object.entries(weights).map(([ch, w]) => [ch, w / total])
    );
  })();

  const channels = brandMeta?.channels ?? [];

  const handleBrandSelect = (brandId: string) => {
    const meta = MOCK_BRANDS.find(b => b.id === brandId);
    if (!meta) return;
    setBrand(brandId);
    setBrandMeta(meta);
    setPriors(null); // reset priors so user must choose
    const equalWeight = 100 / meta.channels.length;
    setWeights(Object.fromEntries(meta.channels.map(ch => [ch, equalWeight])));
  };

  const priorsSelected = priors !== null;

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky nav bar */}
      <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-12">
          <span className="text-[13px] font-medium text-muted-foreground tracking-tight">
            Bayesian MMM <span className="text-border mx-1.5">—</span> AWS Capstone Project
          </span>
          <Link
            to="/under-the-hood"
            className="group inline-flex items-center gap-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-full px-4 py-1.5 shadow-sm shadow-primary/25 transition-all duration-200 hover:shadow-md hover:shadow-primary/30 hover:scale-[1.03]"
          >
            <Sparkles className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-12" />
            Under the Hood
          </Link>
        </div>
      </nav>

      {/* Hero header */}
      <header className="relative overflow-hidden border-b border-border bg-card">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-primary/[0.02]" />
        <div className="relative max-w-7xl mx-auto px-6 py-12 md:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-10 items-start">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground tracking-tight leading-tight text-balance">
              Understand what drives revenue.{' '}
              <span className="text-primary">Quantify uncertainty.</span>{' '}
              Optimize with confidence.
            </h1>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              Most marketing attribution tools give you a number. This one shows you the math behind it and how much to trust it. Select a brand, set your prior beliefs about which channels drive revenue, and watch how the model updates. Every output includes uncertainty bounds, because honest measurement means knowing what you don't know.
            </p>
          </div>

          {/* Brand cards */}
          <div className="mt-10 mb-5">
            <h2 className="text-base font-bold text-foreground tracking-tight">
              Three Companies. Three Marketing Stacks.
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">
              Select a brand to explore its Bayesian MMM results.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MOCK_BRANDS.map((b) => (
              <button
                key={b.id}
                onClick={() => handleBrandSelect(b.id)}
                className={cn(
                  "rounded-xl border-2 bg-background/60 backdrop-blur-sm p-5 flex gap-4 items-start text-left transition-all duration-200 cursor-pointer",
                  brand === b.id
                    ? "border-primary ring-2 ring-primary/20 shadow-md"
                    : "border-border hover:border-primary/40 hover:shadow-sm"
                )}
              >
                <div className="shrink-0 w-20 h-20 flex items-center justify-center p-1">
                  <img src={brandLogos[b.id]} alt={b.name} className={cn("w-full h-full object-contain", b.id === 'poppa_bueno' && "rounded-full")} />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{b.name}</span>
                    <span className="text-xs font-mono text-primary bg-primary/[0.08] px-2 py-0.5 rounded-md">{BRAND_TAGS[b.id]}</span>
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    {b.description.split('.').slice(0, 2).join('.') + '.'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Brand profile card */}
      {brandMeta && (
        <section className="border-b border-border bg-background animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {brand && brandLogos[brand] && (
                    <img src={brandLogos[brand]} alt={brandMeta.name} className="h-8 w-auto object-contain" />
                  )}
                  <div>
                    <h3 className="text-xl font-bold text-foreground tracking-tight">{brandMeta.name}</h3>
                    <p className="text-sm text-primary font-medium mt-0.5">{brandMeta.vertical}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                  {brandMeta.channels.length} channels
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {brandMeta.description}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mr-1">
                  Channel Mix
                </span>
                {brandMeta.channels.map(ch => (
                  <span
                    key={ch}
                    className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    {ch}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Prior selector - must choose before seeing results */}
      {brand && (
        <section className="border-b border-border bg-background">
          <div className="max-w-7xl mx-auto px-6 py-6">
            {!priorsSelected && (
              <p className="text-sm font-medium text-primary mb-3 animate-pulse">
                Choose your prior beliefs to run the model ↓
              </p>
            )}
            <PriorSelector value={priors ?? ''} onChange={setPriors} brand={brand} />
          </div>
        </section>
      )}

      {/* Main content - only shows after priors are selected */}
      {brand && priorsSelected && (
        <main className="max-w-7xl mx-auto px-6 py-6 space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
          <section>
            <AttributionChart brand={brand} priors={priors} />
          </section>
          <section>
            <SaturationCurves brand={brand} priors={priors} />
          </section>
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BudgetSimulator
              key={`sim-${brand}-${priors}`}
              brand={brand}
              priors={priors}
              channels={channels}
              weights={weights}
              allocation={allocation}
              onWeightsChange={setWeights}
            />
            <Recommendations
              key={`rec-${brand}-${priors}`}
              brand={brand}
              priors={priors}
              allocation={allocation}
            />
          </section>
        </main>
      )}
    </div>
  );
}