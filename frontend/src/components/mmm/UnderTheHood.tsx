import { useState, useRef, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const sections = [
  { id: 'bayesian-stats', label: 'Bayesian Statistics' },
  { id: 'bayesian-vs-traditional', label: 'Bayesian vs Traditional MMM' },
  { id: 'pymc-marketing', label: 'How PyMC-Marketing Works' },
  { id: 'mcmc-sampling', label: 'MCMC Sampling' },
  { id: 'prior-system', label: 'Prior Configuration' },
  { id: 'aws-architecture', label: 'AWS Architecture' },
];

/* ───── Shared color constants ───── */
const BLUE = '#3B82F6';
const ORANGE = '#F97316';
const GREEN = '#22C55E';

/* ───── Animated SVG: Prior → Posterior ───── */
function PriorPosteriorSVG() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 800);
    const t2 = setTimeout(() => setStage(2), 1600);
    const t3 = setTimeout(() => setStage(0), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [stage]);

  const priorOpacity = stage >= 0 ? 1 : 0;
  const dataOpacity = stage >= 1 ? 1 : 0;
  const posteriorOpacity = stage >= 2 ? 1 : 0;

  return (
    <svg viewBox="0 0 400 170" className="w-full h-auto" aria-label="Prior updating to posterior distribution">
      {/* Prior: wide bell */}
      <g opacity={priorOpacity} className="transition-opacity duration-500">
        <path
          d="M50,140 Q100,140 130,120 Q160,100 180,60 Q200,20 200,20 Q200,20 220,60 Q240,100 270,120 Q300,140 350,140"
          fill="none" stroke={BLUE} strokeWidth="2.5" strokeDasharray={stage === 0 ? "0" : "6 3"} opacity={stage >= 2 ? 0.3 : 1}
        />
        <text x="160" y="15" fill={BLUE} fontSize="14" fontWeight="700" fontFamily="sans-serif">
          {stage < 2 ? "Prior (wide uncertainty)" : "Prior"}
        </text>
      </g>

      {/* Data points */}
      <g opacity={dataOpacity} className="transition-opacity duration-700">
        {[230, 240, 235, 245, 250, 238, 242, 248, 236, 244].map((x, i) => (
          <circle key={i} cx={x} cy={130 - (i % 3) * 8} r="3.5" fill={GREEN} opacity="0.7" />
        ))}
        {stage === 1 && (
          <text x="220" y="88" fill={GREEN} fontSize="14" fontWeight="700" fontFamily="sans-serif">
            Data arrives
          </text>
        )}
      </g>

      {/* Posterior: narrow, shifted bell */}
      <g opacity={posteriorOpacity} className="transition-opacity duration-700">
        <path
          d="M160,140 Q190,138 210,125 Q230,105 240,50 Q245,30 245,30 Q245,30 250,50 Q260,105 280,125 Q300,138 330,140"
          fill={ORANGE} fillOpacity="0.12" stroke={ORANGE} strokeWidth="2.5"
        />
        <text x="215" y="25" fill={ORANGE} fontSize="14" fontWeight="700" fontFamily="sans-serif">
          Posterior (narrower)
        </text>
      </g>

      {/* X axis */}
      <line x1="40" y1="140" x2="360" y2="140" stroke="hsl(var(--border))" strokeWidth="1" />
    </svg>
  );
}

/* ───── SVG: Ridge vs Bayesian comparison ───── */
function RidgeVsBayesianSVG() {
  return (
    <svg viewBox="0 0 400 150" className="w-full h-auto" aria-label="Ridge regression vs Bayesian comparison">
      {/* Left: single line */}
      <g>
        <text x="50" y="18" fill="hsl(var(--muted-foreground))" fontSize="13" fontWeight="700" fontFamily="sans-serif">Ridge: one line</text>
        <line x1="20" y1="120" x2="180" y2="30" stroke="hsl(var(--muted-foreground))" strokeWidth="2.5" />
        {[30, 55, 70, 90, 110, 130, 150, 165].map((x, i) => (
          <circle key={i} cx={x} cy={120 - (x - 20) * 0.5 + (i % 3 - 1) * 12} r="3.5" fill="hsl(var(--muted-foreground))" opacity="0.4" />
        ))}
        <line x1="15" y1="125" x2="185" y2="125" stroke="hsl(var(--border))" strokeWidth="1" />
      </g>

      {/* Divider */}
      <line x1="200" y1="10" x2="200" y2="130" stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="4 3" />

      {/* Right: band of lines */}
      <g>
        <text x="250" y="18" fill={BLUE} fontSize="13" fontWeight="700" fontFamily="sans-serif">Bayesian: plausible lines</text>
        {[-8, -4, 0, 4, 8].map((offset, i) => (
          <line
            key={i}
            x1="220"
            y1={120 + offset}
            x2="380"
            y2={30 + offset * 2}
            stroke={BLUE}
            strokeWidth="1.5"
            opacity={0.15 + (i === 2 ? 0.5 : 0)}
          />
        ))}
        <path
          d="M220,112 L380,22 L380,38 L220,128 Z"
          fill={BLUE} fillOpacity="0.08"
        />
        {[230, 255, 270, 290, 310, 330, 350, 365].map((x, i) => (
          <circle key={i} cx={x} cy={120 - (x - 220) * 0.55 + (i % 3 - 1) * 10} r="3.5" fill={BLUE} opacity="0.4" />
        ))}
        <line x1="215" y1="125" x2="385" y2="125" stroke="hsl(var(--border))" strokeWidth="1" />
      </g>
    </svg>
  );
}

/* ───── SVG: Adstock decay curve ───── */
function AdstockDecaySVG() {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimate(false);
      setTimeout(() => setAnimate(true), 50);
    }, 3000);
    setAnimate(true);
    return () => clearInterval(interval);
  }, []);

  const decay = 0.7;
  const points: [number, number][] = [];
  for (let w = 0; w < 8; w++) {
    points.push([40 + w * 42, 130 - Math.pow(decay, w) * 100]);
  }
  const pathD = `M${points.map(([x, y]) => `${x},${y}`).join(' L')}`;

  return (
    <svg viewBox="0 0 400 170" className="w-full h-auto" aria-label="Geometric adstock decay">
      {/* Bars showing decayed spend per week */}
      {points.map(([x, y], i) => (
        <g key={i}>
          <rect
            x={x - 10}
            y={y}
            width="20"
            height={130 - y}
            fill={BLUE}
            fillOpacity={animate ? 0.2 + (1 - i / 8) * 0.4 : 0}
            className="transition-all duration-500"
            style={{ transitionDelay: `${i * 120}ms` }}
          />
          <text x={x} y="152" fill="hsl(var(--muted-foreground))" fontSize="12" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">
            W{i + 1}
          </text>
        </g>
      ))}
      {/* Decay curve */}
      <path
        d={pathD}
        fill="none"
        stroke={BLUE}
        strokeWidth="2.5"
        opacity={animate ? 1 : 0}
        className="transition-opacity duration-700"
      />
      {/* Spend marker */}
      <circle cx={points[0][0]} cy={points[0][1]} r="5" fill={BLUE} />
      <text x={points[0][0] + 12} y={points[0][1] - 8} fill={BLUE} fontSize="13" fontWeight="700" fontFamily="sans-serif">
        Spend
      </text>
      <line x1="30" y1="130" x2="370" y2="130" stroke="hsl(var(--border))" strokeWidth="1" />
    </svg>
  );
}

/* ───── SVG: Saturation S-curves ───── */
function SaturationCurveSVG() {
  const lambdas = [
    { value: 1.5, label: 'Low λ', color: BLUE },
    { value: 3, label: 'Mid λ', color: GREEN },
    { value: 6, label: 'High λ', color: ORANGE },
  ];

  return (
    <svg viewBox="0 0 400 200" className="w-full h-auto" aria-label="Logistic saturation curves">
      {lambdas.map(({ value: lam, color }, idx) => {
        const pts: string[] = [];
        for (let x = 0; x <= 100; x += 2) {
          const spend = x / 100;
          const sat = 1 / (1 + Math.exp(-lam * (spend - 0.5)));
          pts.push(`${50 + x * 3},${150 - sat * 110}`);
        }
        return (
          <path key={idx} d={`M${pts.join(' L')}`} fill="none" stroke={color} strokeWidth="2.5" />
        );
      })}
      {/* Axes */}
      <line x1="50" y1="150" x2="360" y2="150" stroke="hsl(var(--border))" strokeWidth="1" />
      <line x1="50" y1="35" x2="50" y2="150" stroke="hsl(var(--border))" strokeWidth="1" />
      <text x="200" y="170" fill="hsl(var(--muted-foreground))" fontSize="13" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">Spend</text>
      <text x="18" y="95" fill="hsl(var(--muted-foreground))" fontSize="13" fontWeight="700" textAnchor="middle" fontFamily="sans-serif" transform="rotate(-90 18 95)">Response</text>

      {/* Legend below chart */}
      {lambdas.map(({ label, color }, idx) => (
        <g key={`legend-${idx}`}>
          <line x1={100 + idx * 100} y1="190" x2={120 + idx * 100} y2="190" stroke={color} strokeWidth="3" />
          <text x={125 + idx * 100} y="194" fill="hsl(var(--foreground))" fontSize="12" fontWeight="700" fontFamily="sans-serif">{label}</text>
        </g>
      ))}
    </svg>
  );
}

/* ───── SVG: MCMC Trace plot ───── */
function TraceplotSVG() {
  const chain1: number[] = [];
  const chain2: number[] = [];
  let v1 = 0.5, v2 = 0.3;
  for (let i = 0; i < 60; i++) {
    v1 += (Math.random() - 0.5) * 0.15;
    v2 += (Math.random() - 0.5) * 0.15;
    v1 = v1 * 0.95 + 0.45 * 0.05;
    v2 = v2 * 0.95 + 0.45 * 0.05;
    chain1.push(v1);
    chain2.push(v2);
  }

  const toPath = (vals: number[]) =>
    `M${vals.map((v, i) => `${30 + i * 5.5},${130 - v * 120}`).join(' L')}`;

  return (
    <svg viewBox="0 0 400 170" className="w-full h-auto" aria-label="MCMC trace plot with two converging chains">
      <path d={toPath(chain1)} fill="none" stroke={BLUE} strokeWidth="2.5" opacity="0.8" />
      <path d={toPath(chain2)} fill="none" stroke={ORANGE} strokeWidth="2.5" opacity="0.8" />
      <line x1="30" y1="130" x2="360" y2="130" stroke="hsl(var(--border))" strokeWidth="1" />
      <line x1="30" y1="10" x2="30" y2="130" stroke="hsl(var(--border))" strokeWidth="1" />
      <text x="190" y="152" fill="hsl(var(--muted-foreground))" fontSize="13" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">Draw</text>
      {/* Legend */}
      <line x1="270" y1="15" x2="295" y2="15" stroke={BLUE} strokeWidth="3" />
      <text x="300" y="19" fill="hsl(var(--foreground))" fontSize="12" fontWeight="700" fontFamily="sans-serif">Chain 1</text>
      <line x1="270" y1="32" x2="295" y2="32" stroke={ORANGE} strokeWidth="3" />
      <text x="300" y="36" fill="hsl(var(--foreground))" fontSize="12" fontWeight="700" fontFamily="sans-serif">Chain 2</text>
    </svg>
  );
}

/* ───── SVG: Prior distributions ───── */
function PriorDistributionsSVG() {
  const sigmas = [
    { value: 0.3, label: 'Conservative (σ=0.3)', color: BLUE },
    { value: 0.7, label: 'Balanced (σ=0.7)', color: ORANGE },
    { value: 1.5, label: 'Aggressive (σ=1.5)', color: GREEN },
  ];

  return (
    <svg viewBox="0 0 420 250" className="w-full h-auto" aria-label="Three HalfNormal prior distributions">
      {/* Y axis label */}
      <text x="14" y="110" fill="hsl(var(--muted-foreground))" fontSize="13" fontWeight="700" textAnchor="middle" fontFamily="sans-serif" transform="rotate(-90 14 110)">Density</text>
      {/* X axis label */}
      <text x="220" y="220" fill="hsl(var(--muted-foreground))" fontSize="13" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">Channel Effect Size</text>

      {sigmas.map(({ value: sigma, color }, idx) => {
        const pts: string[] = [];
        for (let x = 0; x <= 100; x += 1) {
          const xVal = x / 25;
          const pdf = (2 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * (xVal / sigma) ** 2);
          pts.push(`${45 + x * 3.3},${190 - Math.min(pdf, 3) * 45}`);
        }
        return (
          <g key={idx}>
            <path d={`M45,190 L${pts.join(' L')} L${45 + 100 * 3.3},190`} fill={color} fillOpacity={0.1} stroke={color} strokeWidth="2.5" />
          </g>
        );
      })}

      {/* Axes */}
      <line x1="45" y1="190" x2="380" y2="190" stroke="hsl(var(--border))" strokeWidth="1" />
      <line x1="45" y1="20" x2="45" y2="190" stroke="hsl(var(--border))" strokeWidth="1" />

      {/* Legend */}
      {sigmas.map(({ label, color }, idx) => (
        <g key={`legend-${idx}`}>
          <line x1="250" y1={30 + idx * 22} x2="275" y2={30 + idx * 22} stroke={color} strokeWidth="3" />
          <text x="282" y={35 + idx * 22} fill="hsl(var(--foreground))" fontSize="12" fontWeight="700" fontFamily="sans-serif">{label}</text>
        </g>
      ))}
    </svg>
  );
}

/* ───── SVG: AWS Architecture ───── */
function ArchitectureSVG() {
  const boxStyle = "fill-[hsl(var(--muted))] stroke-[hsl(var(--border))]";
  const textStyle = "fill-[hsl(var(--foreground))] font-sans";
  const subTextStyle = "fill-[hsl(var(--muted-foreground))] font-sans";
  const arrowStyle = "stroke-[hsl(var(--primary))] fill-none";

  return (
    <svg viewBox="0 0 400 180" className="w-full h-auto" aria-label="AWS architecture diagram">
      {/* S3 */}
      <rect x="10" y="60" width="70" height="50" rx="6" className={boxStyle} strokeWidth="1.5" />
      <text x="45" y="82" textAnchor="middle" fontSize="11" fontWeight="600" className={textStyle}>S3</text>
      <text x="45" y="98" textAnchor="middle" fontSize="8" className={subTextStyle}>Model Storage</text>

      {/* Arrow */}
      <path d="M80,85 L110,85" className={arrowStyle} strokeWidth="1.5" markerEnd="url(#arrowhead)" />

      {/* EC2 */}
      <rect x="110" y="60" width="80" height="50" rx="6" className={boxStyle} strokeWidth="1.5" />
      <text x="150" y="82" textAnchor="middle" fontSize="11" fontWeight="600" className={textStyle}>EC2</text>
      <text x="150" y="98" textAnchor="middle" fontSize="8" className={subTextStyle}>FastAPI Backend</text>

      {/* Arrow */}
      <path d="M190,85 L220,85" className={arrowStyle} strokeWidth="1.5" markerEnd="url(#arrowhead)" />

      {/* API Gateway */}
      <rect x="220" y="60" width="80" height="50" rx="6" className={boxStyle} strokeWidth="1.5" />
      <text x="260" y="82" textAnchor="middle" fontSize="11" fontWeight="600" className={textStyle}>API GW</text>
      <text x="260" y="98" textAnchor="middle" fontSize="8" className={subTextStyle}>Routing</text>

      {/* Arrow */}
      <path d="M300,85 L330,85" className={arrowStyle} strokeWidth="1.5" markerEnd="url(#arrowhead)" />

      {/* Frontend */}
      <rect x="330" y="60" width="60" height="50" rx="6" className={boxStyle} strokeWidth="1.5" />
      <text x="360" y="82" textAnchor="middle" fontSize="11" fontWeight="600" className={textStyle}>React</text>
      <text x="360" y="98" textAnchor="middle" fontSize="8" className={subTextStyle}>Frontend</text>

      {/* Bedrock */}
      <rect x="110" y="130" width="80" height="40" rx="6" className={boxStyle} strokeWidth="1.5" />
      <text x="150" y="150" textAnchor="middle" fontSize="11" fontWeight="600" className={textStyle}>Bedrock</text>
      <text x="150" y="164" textAnchor="middle" fontSize="8" className={subTextStyle}>AI / LLM</text>

      {/* Arrow EC2 to Bedrock */}
      <path d="M150,110 L150,130" className={arrowStyle} strokeWidth="1.5" markerEnd="url(#arrowhead)" />

      {/* Arrowhead marker */}
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6" fill="hsl(var(--primary))" />
        </marker>
      </defs>
    </svg>
  );
}

/* ───── Code block helper ───── */
function Code({ children }: { children: string }) {
  return (
    <pre className="bg-muted/60 border border-border rounded-lg p-4 text-xs font-mono text-foreground overflow-x-auto leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

/* ───── Section wrapper ───── */
function Section({ id, title, children, diagram }: { id: string; title: string; children: React.ReactNode; diagram?: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16">
      <h3 className="text-lg font-bold text-foreground tracking-tight mb-4">{title}</h3>
      {diagram ? (
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8 items-start">
          <div className="space-y-4">{children}</div>
          <div>{diagram}</div>
        </div>
      ) : (
        <div className="space-y-4">{children}</div>
      )}
    </section>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>;
}

function Emphasis({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground font-medium">{children}</span>;
}

function SvgContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      {children}
    </div>
  );
}

/* ═══════ Main component ═══════ */
export default function UnderTheHood() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState(sections[0].id);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY + 120;
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i].id);
        if (el && el.offsetTop <= scrollTop) {
          setActiveSection(sections[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background" ref={scrollRef}>
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </div>
          <h1 className="text-sm font-semibold text-foreground tracking-tight">Under the Hood</h1>
        </div>

        {/* Sticky TOC */}
        <nav className="border-t border-border bg-background/95 backdrop-blur-sm px-6 py-2.5">
          <div className="max-w-6xl mx-auto flex gap-2 overflow-x-auto">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                  activeSection === s.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-6">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-tight">
          Under the Hood
        </h2>
        <p className="text-lg text-muted-foreground mt-3 leading-relaxed max-w-2xl">
          How Bayesian Marketing Mix Modeling works, from first principles to infrastructure.
        </p>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 pb-16 space-y-16">

        {/* 1. Bayesian Statistics */}
        <Section id="bayesian-stats" title="What is Bayesian Statistics?" diagram={
          <SvgContainer>
            <PriorPosteriorSVG />
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              The wide prior narrows into a focused posterior as data arrives.
            </p>
          </SvgContainer>
        }>
          <Para>
            Traditional (frequentist) statistics gives you <Emphasis>one number</Emphasis> as the answer. "The conversion rate is 3.2%." That is a point estimate. It tells you nothing about how confident you should be, or how much that number might vary.
          </Para>
          <Para>
            Bayesian statistics flips the approach. Instead of a single number, you get a <Emphasis>full distribution of plausible values</Emphasis>. "The conversion rate is most likely between 2.8% and 3.6%, with the peak around 3.2%." That distribution is called the <Emphasis>posterior</Emphasis>.
          </Para>
          <Para>
            The process works in three steps. Start with a <Emphasis>prior</Emphasis>: your initial belief before seeing any data (a wide, uncertain distribution). Then observe <Emphasis>data</Emphasis>. Finally, combine the two using Bayes' theorem to produce the <Emphasis>posterior</Emphasis>: your updated belief that is narrower and more precise.
          </Para>
          <Para>
            The more data you have, the narrower the posterior becomes. With enough data, even a "bad" prior gets overwhelmed by evidence. This is why Bayesian methods are robust: they let you start with assumptions, then let the data correct them.
          </Para>
        </Section>

        {/* 2. Bayesian vs Traditional MMM */}
        <Section id="bayesian-vs-traditional" title="Bayesian MMM vs Traditional MMM" diagram={
          <SvgContainer>
            <RidgeVsBayesianSVG />
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              Left: Ridge gives one regression line. Right: Bayesian gives a band of plausible lines.
            </p>
          </SvgContainer>
        }>
          <Para>
            Traditional Marketing Mix Models typically use Ridge regression. You feed in spend data and revenue, and the model returns <Emphasis>one set of coefficients</Emphasis>. "Meta contributed 34% of revenue." Full stop. No uncertainty attached.
          </Para>
          <Para>
            Bayesian MMM does the same job but returns <Emphasis>a distribution for every coefficient</Emphasis>. "Meta contributed between 28% and 41% of revenue, with 94% probability." That range is a credible interval, and it changes how you make decisions.
          </Para>
          <div className="space-y-2.5 mt-2">
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <p className="text-xs font-semibold text-foreground mb-1">Credible intervals vs confidence intervals</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                A 94% credible interval means "there is a 94% probability the true value falls here." A confidence interval does not mean that, despite how it sounds. The Bayesian version is more intuitive and more useful for decision-making.
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <p className="text-xs font-semibold text-foreground mb-1">Prior knowledge as input</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                If you know TV ads cannot have negative returns, you can encode that as a prior constraint. Ridge regression cannot incorporate this kind of domain expertise directly.
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <p className="text-xs font-semibold text-foreground mb-1">Uncertainty propagates through predictions</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When you optimize budgets, that uncertainty carries forward. Instead of "allocate 40% to Meta," you get "allocating 35-45% to Meta maximizes expected revenue with 90% probability." Uncertainty-aware optimization leads to better hedging.
              </p>
            </div>
          </div>
        </Section>

        {/* 3. PyMC-Marketing */}
        <Section id="pymc-marketing" title="How PyMC-Marketing Works" diagram={
          <div className="space-y-6">
            <SvgContainer>
              <AdstockDecaySVG />
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Spend ripples forward across weeks, decaying geometrically.
              </p>
            </SvgContainer>
            <SvgContainer>
              <SaturationCurveSVG />
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Higher lambda values cause the curve to flatten sooner, indicating faster saturation.
              </p>
            </SvgContainer>
          </div>
        }>
          <Para>
            PyMC-Marketing is an open-source Python library built on top of PyMC, a probabilistic programming framework. It provides a pre-built Bayesian MMM structure so you don't have to write the model from scratch.
          </Para>
          <Para>
            The core model equation looks like this:
          </Para>
          <Code>{`Revenue = intercept + Σ (beta_c × Saturation(Adstock(Spend_c))) + controls + noise

Where:
  - Adstock transforms raw spend into "effective spend" that accounts for carryover
  - Saturation models diminishing returns at high spend levels
  - beta_c is the channel coefficient (sampled from a prior distribution)`}</Code>

          <h4 className="text-sm font-semibold text-foreground mt-4 mb-2">Geometric Adstock</h4>
          <Para>
            When you run a TV ad on Monday, its effect does not vanish on Tuesday. Adstock models this carryover. The geometric version uses a single decay parameter (alpha, typically 0.3 to 0.9) to describe how quickly the effect fades.
          </Para>
          <Code>{`adstocked_spend[t] = spend[t] + alpha × adstocked_spend[t-1]

With alpha = 0.7, a $1000 spend ripples:
  Week 1: $1000, Week 2: $700, Week 3: $490, Week 4: $343...`}</Code>

          <h4 className="text-sm font-semibold text-foreground mt-4 mb-2">Logistic Saturation</h4>
          <Para>
            Doubling your Meta spend does not double conversions. At some point, you are showing ads to people who have already seen them. Saturation models this with a logistic (S-shaped) curve. The lambda parameter controls how quickly returns diminish. A high lambda means the channel saturates quickly.
          </Para>
        </Section>

        {/* 4. MCMC Sampling */}
        <Section id="mcmc-sampling" title="MCMC Sampling and Convergence" diagram={
          <SvgContainer>
            <TraceplotSVG />
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              Two chains (colored lines) explore independently and converge to the same region.
            </p>
          </SvgContainer>
        }>
          <Para>
            Bayesian models need to compute the posterior distribution, but the math is usually intractable for real-world problems. Instead of solving it analytically, we <Emphasis>sample</Emphasis> from the posterior using Markov Chain Monte Carlo (MCMC).
          </Para>
          <Para>
            Think of it like exploring a mountain range in fog. You cannot see the whole landscape, but by taking many steps (always preferring to step uphill toward higher probability), you eventually map out the peaks and valleys. The collection of all your steps becomes a map of the posterior.
          </Para>
          <Para>
            This project uses the <Emphasis>No U-Turn Sampler (NUTS)</Emphasis>, an advanced MCMC algorithm that automatically adjusts its step size and avoids wasting time retracing its path (the "U-turn" it avoids).
          </Para>

          <Code>{`Sampling configuration:
  - Chains: 2 (independent explorers of the posterior)
  - Draws: 1,000 per chain (samples after warmup)
  - Tune: 500 (warmup steps to calibrate step size)
  - Total samples: 2,000 (used for all posterior summaries)`}</Code>

          <Para>
            <Emphasis>R-hat</Emphasis> is the convergence diagnostic. It compares within-chain variance to between-chain variance. If both chains found the same posterior, R-hat will be close to 1.0. Values above 1.05 suggest the chains have not converged and more sampling is needed. All parameters in this project show R-hat below 1.02.
          </Para>
        </Section>

        {/* 5. Prior Configuration */}
        <Section id="prior-system" title="The Prior Configuration System" diagram={
          <SvgContainer>
            <PriorDistributionsSVG />
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              Three HalfNormal priors with different widths. Narrower priors are more skeptical.
            </p>
          </SvgContainer>
        }>
          <Para>
            In Bayesian modeling, the prior is your starting assumption about how the world works before seeing data. This project uses a <Emphasis>HalfNormal distribution</Emphasis> for the saturation_beta parameter, which controls how much each channel contributes to revenue.
          </Para>
          <Para>
            HalfNormal is a bell curve that only exists on the positive side (because channel contributions cannot be negative). The sigma parameter controls how wide it is: a small sigma concentrates probability near zero (skeptical), while a large sigma spreads probability over a wide range (permissive).
          </Para>

          <Code>{`saturation_beta ~ HalfNormal(sigma=σ)

Three presets:
  Conservative (σ=0.3): Skeptical. Channels must "prove" their contribution.
  Balanced (σ=0.7):     Moderate. Reasonable default for most analyses.
  Aggressive (σ=1.5):   Permissive. Allows large channel effects.`}</Code>

          <Para>
            The key insight: with enough data, all three priors converge to similar posteriors. The prior matters most when data is scarce. In this demo, you can toggle between presets to see how the prior choice affects the attribution results, then observe how different channels are more or less sensitive to the prior depending on how much data supports them.
          </Para>
        </Section>

        {/* 6. AWS Architecture */}
        <Section id="aws-architecture" title="AWS Architecture">
          <Para>
            The full production system is designed around four AWS services. Each handles a specific layer of the stack.
          </Para>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <p className="text-xs font-semibold text-foreground mb-1">S3 (Model Storage)</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Trained PyMC model artifacts (NetCDF trace files, ~50MB each) are stored in S3 buckets. Each brand/prior combination produces a separate model file. S3 also stores the preprocessed datasets.
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <p className="text-xs font-semibold text-foreground mb-1">EC2 (FastAPI Backend)</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                A FastAPI server runs on EC2, loading model traces from S3 and computing posterior summaries on the fly. Endpoints include attribution, saturation curves, and budget optimization. The server uses NumPy and ArviZ for posterior analysis.
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <p className="text-xs font-semibold text-foreground mb-1">API Gateway (Routing)</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                API Gateway provides a stable HTTPS endpoint, rate limiting, and CORS configuration. It proxies requests to the EC2 instance and handles SSL termination.
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <p className="text-xs font-semibold text-foreground mb-1">Bedrock (AI Recommendations)</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Amazon Bedrock provides LLM-powered budget recommendations using Nova Micro. The model receives posterior ROAS values, HDI credible intervals, and saturation status per channel, then generates plain-language allocation advice grounded in the actual model outputs.
              </p>
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}
