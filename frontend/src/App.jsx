/**
 * App.jsx
 * -------
 * Root component. Owns all shared state and renders two views:
 *
 *   setup     → DatasetSelector + PriorSliders (shown until a brand is chosen)
 *   dashboard → all chart and simulator components
 *
 * State lifted here (rather than inside each component) because several
 * components need the same brand/priors/allocation values:
 *   - BudgetSimulator reads and writes the allocation weights
 *   - Recommendations reads the current allocation to generate advice
 *   - AttributionChart and SaturationCurves both re-fetch when brand/priors change
 */

import { useState } from 'react';
import DatasetSelector from './components/DatasetSelector';
import PriorSliders from './components/PriorSliders';
import AttributionChart from './components/AttributionChart';
import SaturationCurves from './components/SaturationCurves';
import BudgetSimulator from './components/BudgetSimulator';
import Recommendations from './components/Recommendations';

function App() {
  // Selected brand ID and its metadata from /datasets
  const [brand, setBrand] = useState(null);
  const [brandMeta, setBrandMeta] = useState(null); // { name, vertical, channels, description }

  // Prior configuration — controls which .nc model file the API loads
  const [priors, setPriors] = useState('balanced');

  // Budget simulator weights — raw slider values (0–100) per channel.
  // Fractions for the API are computed by normalising these to sum to 1.
  // Stored as weights (not fractions) so moving one slider doesn't
  // force programmatic updates to all the others.
  const [weights, setWeights] = useState({});

  // Derive normalised allocation fractions from raw weights.
  // This is what gets sent to /simulator/predict and /recommend.
  const allocation = (() => {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    if (total === 0) return {};
    return Object.fromEntries(
      Object.entries(weights).map(([ch, w]) => [ch, w / total])
    );
  })();

  const channels = brandMeta?.channels ?? [];

  // Called by DatasetSelector when the user picks a brand.
  // Resets weights to an equal split across the new brand's channels.
  const handleBrandSelect = (brandId, meta) => {
    setBrand(brandId);
    setBrandMeta(meta);
    const equalWeight = 100 / meta.channels.length;
    setWeights(Object.fromEntries(meta.channels.map(ch => [ch, equalWeight])));
  };

  const handlePriorsChange = (newPriors) => {
    setPriors(newPriors);
  };

  return (
    <div>
      <h1>MMM Project — Bayesian Marketing Mix Model</h1>

      {/* ── Setup controls — always visible so user can switch brand/priors ── */}
      <DatasetSelector onSelect={handleBrandSelect} activeBrand={brand} />
      <PriorSliders value={priors} onChange={handlePriorsChange} />

      {/* ── Dashboard — renders only after a brand is selected ── */}
      {brand && (
        <>
          <AttributionChart brand={brand} priors={priors} />
          <SaturationCurves brand={brand} priors={priors} />
          <BudgetSimulator
            brand={brand}
            priors={priors}
            channels={channels}
            weights={weights}
            allocation={allocation}
            onWeightsChange={setWeights}
          />
          <Recommendations
            brand={brand}
            priors={priors}
            allocation={allocation}
          />
        </>
      )}
    </div>
  );
}

export default App;
