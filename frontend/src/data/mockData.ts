/**
 * Mock data for the Bayesian MMM dashboard.
 * Three brands with realistic posterior outputs: contribution percentages that sum to ~100%,
 * meaningfully wide HDI intervals, ROAS between 0.5-2.0, and saturation curves
 * showing genuine diminishing returns.
 */

export interface BrandMeta {
  id: string;
  name: string;
  vertical: string;
  channels: string[];
  description: string;
}

export interface ChannelContribution {
  channel: string;
  contribution_pct: number;
  contribution_hdi_low: number;
  contribution_hdi_high: number;
  roas_mean: number;
  roas_hdi_low: number;
  roas_hdi_high: number;
}

export interface ModelFit {
  r_squared: number;
  rmse: number;
  n_obs: number;
}

export interface ModelResults {
  brand: string;
  priors: string;
  channel_contributions: ChannelContribution[];
  model_fit: ModelFit;
}

export interface SaturationPoint {
  spend: number;
  contribution_mean: number;
  hdi_low: number;
  hdi_high: number;
}

export interface SaturationData {
  brand: string;
  priors: string;
  curves: Record<string, SaturationPoint[]>;
}

export interface SimulationResult {
  brand: string;
  priors: string;
  predicted_revenue_mean: number;
  predicted_revenue_hdi_low: number;
  predicted_revenue_hdi_high: number;
  current_revenue_mean: number;
  delta_mean: number;
  delta_pct: number;
  proposed_spend_per_channel: Record<string, number>;
}

export interface RecommendationResult {
  brand: string;
  priors: string;
  recommendation_text: string;
  suggested_allocation: Record<string, number>;
  reasoning: {
    increase: string[];
    decrease: string[];
    maintain: string[];
  };
  channel_context: Record<string, {
    roas_mean: number;
    roas_hdi_low: number;
    roas_hdi_high: number;
    contribution_pct: number;
    saturation_status: string;
  }>;
  bedrock_enabled: boolean;
}

export interface PriorPersona {
  conservative: { role: string; quote: string };
  balanced: { role: string; quote: string };
  aggressive: { role: string; quote: string };
}

/* ─── Brand definitions ─── */

export const MOCK_BRANDS: BrandMeta[] = [
  {
    id: 'kova',
    name: 'Kova',
    vertical: 'DTC Running Watch',
    channels: ['Meta', 'TikTok', 'Paid_Search', 'Email'],
    description: 'DTC running watch built by ex-Nike engineers, tracking power output and biomechanics for serious runners. $8M ARR grown through Strava integrations and ultramarathon communities. 52 weeks modeled with LogisticSaturation + geometric adstock.',
  },
  {
    id: 'poppa_bueno',
    name: 'Poppa Bueno',
    vertical: 'CPG Hot Sauce',
    channels: ['TV', 'Meta', 'OOH', 'Trade_Promo'],
    description: 'Family-owned hot sauce born from a backyard pepper garden on Bainbridge Island. Mixing regional TV and retail trade promo with DTC Meta campaigns. 48 weeks observed with HillSaturation + delayed adstock for TV/OOH.',
  },
  {
    id: 'nestwork',
    name: 'Nestwork',
    vertical: 'B2B Proptech SaaS',
    channels: ['LinkedIn', 'Content/SEO', 'Paid_Search', 'Webinars'],
    description: 'Property management SaaS for independent landlords with 1-20 units. Pre-Series A, burning lean. Every marketing dollar must justify itself. 40 weeks of pipeline data modeled with LogisticSaturation.',
  },
];

/* ─── Prior personas per brand ─── */

export const PRIOR_PERSONAS: Record<string, PriorPersona> = {
  kova: {
    conservative: { role: 'Skeptical CFO', quote: '"Show me the data before I believe anything."' },
    balanced: { role: 'Head of Growth', quote: '"No strong opinions. Let the model tell me what\'s working."' },
    aggressive: { role: 'The Founder', quote: '"I know TikTok is our growth engine. I\'ve seen it firsthand."' },
  },
  'poppa_bueno': {
    conservative: { role: 'Retail Buyer', quote: '"Hot sauce is crowded. Prove any channel is moving the needle."' },
    balanced: { role: 'New CMO', quote: '"The brand\'s been running on vibes. Show me what actually works."' },
    aggressive: { role: 'Ridge (Founder)', quote: '"Every time we run TV, the phones ring. I know it works."' },
  },
  nestwork: {
    conservative: { role: 'Seed Investor', quote: '"SaaS CAC numbers are easy to game. Show me what the data supports."' },
    balanced: { role: 'The Founder', quote: '"I\'ve been too close to this. I genuinely don\'t know what\'s driving growth."' },
    aggressive: { role: 'Head of Demand Gen', quote: '"Content/SEO and Paid_Search drive 80% of pipeline. Always."' },
  },
};

/* ─── Saturation curve generator ─── */

function generateSaturationCurve(
  maxSpend: number,
  saturationPoint: number,
  maxContribution: number,
  uncertainty: number,
  numPoints = 50
): SaturationPoint[] {
  const points: SaturationPoint[] = [];
  for (let i = 0; i < numPoints; i++) {
    const spend = (i / (numPoints - 1)) * maxSpend * 1.5;
    const contribution_mean = maxContribution * (1 - Math.exp(-spend / saturationPoint));
    const bandWidth = uncertainty * contribution_mean * (0.3 + 0.7 * (spend / (maxSpend * 1.5)));
    points.push({
      spend: Math.round(spend),
      contribution_mean: parseFloat(contribution_mean.toFixed(2)),
      hdi_low: parseFloat(Math.max(0, contribution_mean - bandWidth).toFixed(2)),
      hdi_high: parseFloat((contribution_mean + bandWidth).toFixed(2)),
    });
  }
  return points;
}

/* ─── Kova contributions (4 channels) ─── */
/* Meta: long adstock, retargeting+lookalikes. TikTok: saturates fast after ~$10k/wk. Paid Search: steady workhorse. Email: low spend, high ROAS. */

const KOVA_BALANCED: ChannelContribution[] = [
  { channel: 'Meta', contribution_pct: 33.1, contribution_hdi_low: 25.4, contribution_hdi_high: 41.2, roas_mean: 1.48, roas_hdi_low: 1.08, roas_hdi_high: 1.91 },
  { channel: 'TikTok', contribution_pct: 22.6, contribution_hdi_low: 13.8, contribution_hdi_high: 32.1, roas_mean: 1.02, roas_hdi_low: 0.58, roas_hdi_high: 1.51 },
  { channel: 'Paid_Search', contribution_pct: 29.4, contribution_hdi_low: 22.1, contribution_hdi_high: 36.9, roas_mean: 1.76, roas_hdi_low: 1.28, roas_hdi_high: 2.21 },
  { channel: 'Email', contribution_pct: 14.9, contribution_hdi_low: 9.2, contribution_hdi_high: 21.4, roas_mean: 1.92, roas_hdi_low: 1.44, roas_hdi_high: 2.38 },
];

const KOVA_CONSERVATIVE: ChannelContribution[] = [
  { channel: 'Meta', contribution_pct: 30.8, contribution_hdi_low: 26.1, contribution_hdi_high: 35.7, roas_mean: 1.38, roas_hdi_low: 1.14, roas_hdi_high: 1.63 },
  { channel: 'TikTok', contribution_pct: 23.4, contribution_hdi_low: 18.1, contribution_hdi_high: 29.0, roas_mean: 1.06, roas_hdi_low: 0.79, roas_hdi_high: 1.34 },
  { channel: 'Paid_Search', contribution_pct: 28.2, contribution_hdi_low: 23.6, contribution_hdi_high: 32.9, roas_mean: 1.68, roas_hdi_low: 1.38, roas_hdi_high: 1.99 },
  { channel: 'Email', contribution_pct: 17.6, contribution_hdi_low: 13.4, contribution_hdi_high: 22.0, roas_mean: 2.04, roas_hdi_low: 1.68, roas_hdi_high: 2.41 },
];

const KOVA_AGGRESSIVE: ChannelContribution[] = [
  { channel: 'Meta', contribution_pct: 35.8, contribution_hdi_low: 21.2, contribution_hdi_high: 49.4, roas_mean: 1.61, roas_hdi_low: 0.88, roas_hdi_high: 2.38 },
  { channel: 'TikTok', contribution_pct: 21.4, contribution_hdi_low: 7.6, contribution_hdi_high: 36.8, roas_mean: 0.96, roas_hdi_low: 0.31, roas_hdi_high: 1.72 },
  { channel: 'Paid_Search', contribution_pct: 30.9, contribution_hdi_low: 17.4, contribution_hdi_high: 44.2, roas_mean: 1.85, roas_hdi_low: 0.98, roas_hdi_high: 2.74 },
  { channel: 'Email', contribution_pct: 11.9, contribution_hdi_low: 3.2, contribution_hdi_high: 22.1, roas_mean: 1.82, roas_hdi_low: 1.02, roas_hdi_high: 2.64 },
];

/* ─── Poppa Bueno contributions (4 channels) ─── */
/* TV: regional cable, high adstock lingering weeks. Meta: viral recipe videos, drops after ~$15k/wk. OOH: billboards near retail. Trade Promo: end-caps, correlated with OOH timing. */

const PB_BALANCED: ChannelContribution[] = [
  { channel: 'TV', contribution_pct: 34.2, contribution_hdi_low: 24.8, contribution_hdi_high: 43.9, roas_mean: 1.24, roas_hdi_low: 0.86, roas_hdi_high: 1.64 },
  { channel: 'Meta', contribution_pct: 26.8, contribution_hdi_low: 19.1, contribution_hdi_high: 34.7, roas_mean: 1.52, roas_hdi_low: 1.04, roas_hdi_high: 2.01 },
  { channel: 'OOH', contribution_pct: 18.3, contribution_hdi_low: 9.6, contribution_hdi_high: 27.8, roas_mean: 0.78, roas_hdi_low: 0.38, roas_hdi_high: 1.21 },
  { channel: 'Trade_Promo', contribution_pct: 20.7, contribution_hdi_low: 13.4, contribution_hdi_high: 28.2, roas_mean: 1.61, roas_hdi_low: 1.12, roas_hdi_high: 2.08 },
];

const PB_CONSERVATIVE: ChannelContribution[] = [
  { channel: 'TV', contribution_pct: 32.1, contribution_hdi_low: 27.2, contribution_hdi_high: 37.2, roas_mean: 1.16, roas_hdi_low: 0.96, roas_hdi_high: 1.38 },
  { channel: 'Meta', contribution_pct: 25.4, contribution_hdi_low: 21.1, contribution_hdi_high: 29.8, roas_mean: 1.44, roas_hdi_low: 1.18, roas_hdi_high: 1.71 },
  { channel: 'OOH', contribution_pct: 19.8, contribution_hdi_low: 14.6, contribution_hdi_high: 25.2, roas_mean: 0.84, roas_hdi_low: 0.61, roas_hdi_high: 1.09 },
  { channel: 'Trade_Promo', contribution_pct: 22.7, contribution_hdi_low: 18.2, contribution_hdi_high: 27.4, roas_mean: 1.72, roas_hdi_low: 1.38, roas_hdi_high: 2.06 },
];

const PB_AGGRESSIVE: ChannelContribution[] = [
  { channel: 'TV', contribution_pct: 36.8, contribution_hdi_low: 19.4, contribution_hdi_high: 53.1, roas_mean: 1.34, roas_hdi_low: 0.64, roas_hdi_high: 2.08 },
  { channel: 'Meta', contribution_pct: 28.1, contribution_hdi_low: 13.2, contribution_hdi_high: 42.4, roas_mean: 1.59, roas_hdi_low: 0.68, roas_hdi_high: 2.52 },
  { channel: 'OOH', contribution_pct: 16.4, contribution_hdi_low: 4.1, contribution_hdi_high: 30.2, roas_mean: 0.70, roas_hdi_low: 0.16, roas_hdi_high: 1.31 },
  { channel: 'Trade_Promo', contribution_pct: 18.7, contribution_hdi_low: 6.8, contribution_hdi_high: 31.9, roas_mean: 1.48, roas_hdi_low: 0.72, roas_hdi_high: 2.26 },
];

/* ─── Nestwork contributions (4 channels) ─── */
/* LinkedIn: long sales cycle, high adstock. Content/SEO: slowest to build, highest long-term ROAS, low saturation. Paid Search: high intent, fast conversion. Webinars: educational, correlated with Content/SEO. */

const NW_BALANCED: ChannelContribution[] = [
  { channel: 'LinkedIn', contribution_pct: 28.4, contribution_hdi_low: 20.1, contribution_hdi_high: 37.2, roas_mean: 1.34, roas_hdi_low: 0.91, roas_hdi_high: 1.79 },
  { channel: 'Content/SEO', contribution_pct: 31.2, contribution_hdi_low: 22.6, contribution_hdi_high: 40.4, roas_mean: 1.88, roas_hdi_low: 1.32, roas_hdi_high: 2.46 },
  { channel: 'Paid_Search', contribution_pct: 24.8, contribution_hdi_low: 16.4, contribution_hdi_high: 33.6, roas_mean: 1.56, roas_hdi_low: 0.98, roas_hdi_high: 2.14 },
  { channel: 'Webinars', contribution_pct: 15.6, contribution_hdi_low: 7.8, contribution_hdi_high: 24.1, roas_mean: 1.12, roas_hdi_low: 0.52, roas_hdi_high: 1.76 },
];

const NW_CONSERVATIVE: ChannelContribution[] = [
  { channel: 'LinkedIn', contribution_pct: 27.1, contribution_hdi_low: 22.8, contribution_hdi_high: 31.6, roas_mean: 1.28, roas_hdi_low: 1.06, roas_hdi_high: 1.52 },
  { channel: 'Content/SEO', contribution_pct: 30.4, contribution_hdi_low: 25.8, contribution_hdi_high: 35.2, roas_mean: 1.82, roas_hdi_low: 1.52, roas_hdi_high: 2.14 },
  { channel: 'Paid_Search', contribution_pct: 25.6, contribution_hdi_low: 20.8, contribution_hdi_high: 30.6, roas_mean: 1.52, roas_hdi_low: 1.21, roas_hdi_high: 1.84 },
  { channel: 'Webinars', contribution_pct: 16.9, contribution_hdi_low: 12.2, contribution_hdi_high: 21.8, roas_mean: 1.18, roas_hdi_low: 0.82, roas_hdi_high: 1.56 },
];

const NW_AGGRESSIVE: ChannelContribution[] = [
  { channel: 'LinkedIn', contribution_pct: 30.2, contribution_hdi_low: 14.8, contribution_hdi_high: 46.1, roas_mean: 1.42, roas_hdi_low: 0.64, roas_hdi_high: 2.24 },
  { channel: 'Content/SEO', contribution_pct: 32.4, contribution_hdi_low: 16.1, contribution_hdi_high: 48.2, roas_mean: 1.94, roas_hdi_low: 0.92, roas_hdi_high: 2.98 },
  { channel: 'Paid_Search', contribution_pct: 23.6, contribution_hdi_low: 9.2, contribution_hdi_high: 38.8, roas_mean: 1.48, roas_hdi_low: 0.54, roas_hdi_high: 2.46 },
  { channel: 'Webinars', contribution_pct: 13.8, contribution_hdi_low: 2.4, contribution_hdi_high: 26.8, roas_mean: 0.98, roas_hdi_low: 0.14, roas_hdi_high: 1.92 },
];

/* ─── Lookup helpers ─── */

const CONTRIBUTIONS: Record<string, Record<string, ChannelContribution[]>> = {
  kova: { balanced: KOVA_BALANCED, conservative: KOVA_CONSERVATIVE, aggressive: KOVA_AGGRESSIVE },
  'poppa_bueno': { balanced: PB_BALANCED, conservative: PB_CONSERVATIVE, aggressive: PB_AGGRESSIVE },
  nestwork: { balanced: NW_BALANCED, conservative: NW_CONSERVATIVE, aggressive: NW_AGGRESSIVE },
};

const MODEL_FITS: Record<string, ModelFit> = {
  kova: { r_squared: 0.91, rmse: 14820, n_obs: 52 },
  'poppa_bueno': { r_squared: 0.87, rmse: 21340, n_obs: 48 },
  nestwork: { r_squared: 0.84, rmse: 4280, n_obs: 40 },
};

export function getMockModelResults(brand: string, priors: string): ModelResults {
  const contributions = CONTRIBUTIONS[brand]?.[priors] ?? CONTRIBUTIONS.kova.balanced;
  return {
    brand,
    priors,
    channel_contributions: contributions,
    model_fit: MODEL_FITS[brand] ?? MODEL_FITS.kova,
  };
}

/* ─── Saturation curves ─── */
/* Spend magnitudes reflect each brand's scale: Kova ~$154k/wk, Poppa Bueno ~$210k/wk (TV heavy), Nestwork ~$38k/wk (lean SaaS) */

const SATURATION_PARAMS: Record<string, { maxSpend: number; satPoint: number; maxContrib: number }> = {
  // Kova channels
  'Meta': { maxSpend: 65000, satPoint: 28000, maxContrib: 36 },
  'TikTok': { maxSpend: 35000, satPoint: 10000, maxContrib: 24 },  // saturates fast per brief
  'Paid_Search': { maxSpend: 55000, satPoint: 24000, maxContrib: 34 },
  'Email': { maxSpend: 15000, satPoint: 5000, maxContrib: 18 },    // low spend, high efficiency
  // Poppa Bueno channels
  'TV': { maxSpend: 120000, satPoint: 55000, maxContrib: 48 },     // high adstock, big spend
  'OOH': { maxSpend: 45000, satPoint: 25000, maxContrib: 22 },
  'Trade_Promo': { maxSpend: 50000, satPoint: 18000, maxContrib: 28 },
  // Nestwork channels (lean SaaS budgets)
  'LinkedIn': { maxSpend: 18000, satPoint: 8000, maxContrib: 30 },
  'Content/SEO': { maxSpend: 14000, satPoint: 5000, maxContrib: 34 },  // low saturation per brief
  'Webinars': { maxSpend: 8000, satPoint: 3500, maxContrib: 18 },
};

export function getMockSaturationData(brand: string, priors: string): SaturationData {
  const brandMeta = MOCK_BRANDS.find(b => b.id === brand);
  const channels = brandMeta?.channels ?? ['Meta', 'TikTok', 'Paid_Search', 'Email'];
  const uncertaintyMultiplier = priors === 'conservative' ? 0.15 : priors === 'aggressive' ? 0.35 : 0.22;

  const curves: Record<string, SaturationPoint[]> = {};
  for (const ch of channels) {
    const params = SATURATION_PARAMS[ch] ?? { maxSpend: 50000, satPoint: 20000, maxContrib: 20 };
    curves[ch] = generateSaturationCurve(params.maxSpend, params.satPoint, params.maxContrib, uncertaintyMultiplier);
  }

  return { brand, priors, curves };
}

/* ─── Budget simulation ─── */

const BRAND_REVENUE: Record<string, { current: number; totalSpend: number }> = {
  kova: { current: 154000, totalSpend: 85000 },          // ~$8M ARR / 52 weeks
  'poppa_bueno': { current: 412000, totalSpend: 210000 }, // CPG scale with TV
  nestwork: { current: 42000, totalSpend: 9500 },         // pre-Series A lean
};

export function getMockSimulationResult(
  brand: string,
  priors: string,
  allocation: Record<string, number>
): SimulationResult {
  const { current: currentRevenue, totalSpend } = BRAND_REVENUE[brand] ?? BRAND_REVENUE.kova;

  const entries = Object.entries(allocation);
  let revenueMultiplier = 1.0;
  for (const [ch, frac] of entries) {
    if (ch === 'Paid_Search' || ch === 'Email' || ch === 'Content/SEO') revenueMultiplier += (frac - 0.2) * 0.3;
    if (ch === 'TikTok' || ch === 'OOH' || ch === 'Webinars') revenueMultiplier -= (frac - 0.15) * 0.1;
  }

  const predictedMean = Math.round(currentRevenue * revenueMultiplier);
  const hdiWidth = predictedMean * 0.12;
  const delta = predictedMean - currentRevenue;

  return {
    brand,
    priors,
    predicted_revenue_mean: predictedMean,
    predicted_revenue_hdi_low: Math.round(predictedMean - hdiWidth),
    predicted_revenue_hdi_high: Math.round(predictedMean + hdiWidth),
    current_revenue_mean: currentRevenue,
    delta_mean: delta,
    delta_pct: parseFloat(((delta / currentRevenue) * 100).toFixed(1)),
    proposed_spend_per_channel: Object.fromEntries(
      entries.map(([ch, frac]) => [ch, Math.round(totalSpend * frac)])
    ),
  };
}

/* ─── Recommendations ─── */

const RECOMMENDATION_TEXT: Record<string, string> = {
  kova: 'Shift 10-15% of budget from TikTok into Paid Search and Email. Paid Search shows the highest posterior ROAS with a tight credible interval, indicating reliable returns. Email has the highest ROAS of any channel and is well below its saturation point, so there\'s significant room to scale. TikTok\'s wide HDI suggests the model is uncertain about its true effectiveness at current spend levels.',
  'poppa_bueno': 'Reallocate 8-12% from OOH into Trade Promo and Meta. OOH has the widest HDI and lowest posterior ROAS, meaning the model can\'t confidently say it\'s driving sales. Trade Promo shows strong, reliable returns with room to grow before saturation. TV dominates contribution but is approaching saturation. Maintain but don\'t increase.',
  nestwork: 'Increase Content/SEO allocation by 10-15% by pulling from Webinars. Content/SEO shows the highest ROAS with a reasonably tight interval and still has headroom on the saturation curve. Webinars have the widest HDI, and the model needs more data to be confident in their contribution. LinkedIn is steady but approaching saturation at current spend.',
};

const SUGGESTED_ALLOCATIONS: Record<string, Record<string, number>> = {
  kova: { 'Meta': 0.30, 'TikTok': 0.12, 'Paid_Search': 0.35, 'Email': 0.23 },
  'poppa_bueno': { 'TV': 0.32, 'Meta': 0.28, 'OOH': 0.12, 'Trade_Promo': 0.28 },
  nestwork: { 'LinkedIn': 0.24, 'Content/SEO': 0.38, 'Paid_Search': 0.26, 'Webinars': 0.12 },
};

const REASONING: Record<string, { increase: string[]; decrease: string[]; maintain: string[] }> = {
  kova: {
    increase: [
      'Paid_Search: Highest ROAS (1.76) with tightest HDI — model is most confident here',
      'Email: ROAS 1.92 and below saturation — cheapest incremental revenue available',
    ],
    decrease: [
      'TikTok: Wide HDI (13.8%–32.1%) signals high model uncertainty. Reduce until more data narrows the interval.',
    ],
    maintain: ['Meta'],
  },
  'poppa_bueno': {
    increase: [
      'Trade_Promo: ROAS 1.61 with moderate headroom on saturation curve — strong scaling opportunity',
      'Meta: ROAS 1.52 with room to grow before diminishing returns kick in',
    ],
    decrease: [
      'OOH: Widest HDI (9.6%–27.8%) and lowest ROAS (0.78). Model is uncertain this channel is worth its spend.',
    ],
    maintain: ['TV'],
  },
  nestwork: {
    increase: [
      'Content/SEO: Highest ROAS (1.88) with significant headroom — organic content scales efficiently in B2B',
      'Paid_Search: Strong ROAS (1.56) with reliable interval, good for capturing intent-stage demand',
    ],
    decrease: [
      'Webinars: Wide HDI (7.8%–24.1%) means the model lacks confidence. Needs more observations before scaling.',
    ],
    maintain: ['LinkedIn'],
  },
};

export function getMockRecommendation(
  brand: string,
  priors: string,
  allocation: Record<string, number>
): RecommendationResult {
  const contributions = CONTRIBUTIONS[brand]?.balanced ?? KOVA_BALANCED;

  return {
    brand,
    priors,
    recommendation_text: RECOMMENDATION_TEXT[brand] ?? RECOMMENDATION_TEXT.kova,
    suggested_allocation: SUGGESTED_ALLOCATIONS[brand] ?? SUGGESTED_ALLOCATIONS.kova,
    reasoning: REASONING[brand] ?? REASONING.kova,
    channel_context: Object.fromEntries(
      contributions.map(c => [
        c.channel,
        {
          roas_mean: c.roas_mean,
          roas_hdi_low: c.roas_hdi_low,
          roas_hdi_high: c.roas_hdi_high,
          contribution_pct: c.contribution_pct,
          saturation_status: c.contribution_pct > 28 ? 'near_saturation' : c.contribution_pct > 18 ? 'moderate_headroom' : 'high_headroom',
        },
      ])
    ),
    bedrock_enabled: false,
  };
}
