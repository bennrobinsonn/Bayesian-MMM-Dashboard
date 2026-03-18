/**
 * PriorSliders.jsx
 * ----------------
 * Lets the user select a prior configuration, which controls which of the
 * three pre-fit models the API loads (conservative / balanced / aggressive).
 *
 * This is the "domain knowledge" UI — the core Bayesian concept of the dashboard.
 * Each option maps directly to a HalfNormal sigma value in the PyMC model:
 *   conservative → sigma=0.3  (tight prior, data must work hard to move it)
 *   balanced     → sigma=0.7  (neutral)
 *   aggressive   → sigma=1.5  (wide prior, posterior can move freely)
 *
 * Rendered as radio buttons so only one can be active at a time.
 * Lovable will likely replace this with a styled segmented control or slider.
 */

const PRIOR_OPTIONS = [
  {
    value: 'conservative',
    label: 'Conservative',
    sigma: 0.3,
    description: 'Skeptical of all channels — the model needs strong evidence before attributing revenue.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    sigma: 0.7,
    description: 'Neutral prior — the data drives the posterior with minimal thumb on the scale.',
  },
  {
    value: 'aggressive',
    label: 'Aggressive',
    sigma: 1.5,
    description: 'Confident that channels are strong drivers — wide prior gives the posterior room to reflect large effects.',
  },
];

function PriorSliders({ value, onChange }) {
  return (
    <div>
      <label>Prior Configuration (Domain Knowledge)</label>
      <p>
        Your prior belief about channel effectiveness — maps directly to the
        HalfNormal sigma in the Bayesian model. Changing this loads a different
        pre-fit posterior.
      </p>
      {PRIOR_OPTIONS.map(opt => (
        <label key={opt.value}>
          <input
            type="radio"
            name="priors"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <strong>{opt.label}</strong> (σ={opt.sigma}) — {opt.description}
        </label>
      ))}
    </div>
  );
}

export default PriorSliders;
