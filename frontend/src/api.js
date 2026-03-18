/**
 * api.js
 * ------
 * All fetch calls to the FastAPI backend.
 * This is the single file that knows the API's URL and endpoint shapes.
 * Components import named functions from here — they never call fetch() directly.
 *
 * Base URL points to the local FastAPI server during development.
 * When deployed, update API_BASE to the API Gateway URL.
 */

const API_BASE = 'http://localhost:8000';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// GET /datasets
// Returns { brands: [{ id, name, vertical, channels, description }] }
export const fetchDatasets = () =>
  request('/datasets');

// GET /model/results?brand=kova&priors=balanced
// Returns { brand, priors, channel_contributions, model_fit }
// channel_contributions: [{ channel, contribution_pct, contribution_hdi_low,
//   contribution_hdi_high, roas_mean, roas_hdi_low, roas_hdi_high }]
// model_fit: { r_squared, rmse, n_obs }
export const fetchModelResults = (brand, priors) =>
  request(`/model/results?brand=${brand}&priors=${priors}`);

// GET /model/saturation?brand=kova&priors=balanced
// Returns { brand, priors, curves: { [channel]: [{ spend, contribution_mean, hdi_low, hdi_high }] } }
export const fetchSaturationCurves = (brand, priors) =>
  request(`/model/saturation?brand=${brand}&priors=${priors}`);

// POST /simulator/predict
// Body:    { brand, priors, budget_allocation: { [channel]: fraction } }  ← fractions sum to 1.0
// Returns: { brand, priors, predicted_revenue_mean, predicted_revenue_hdi_low,
//            predicted_revenue_hdi_high, current_revenue_mean,
//            delta_mean, delta_pct, proposed_spend_per_channel }
export const predictBudget = (brand, priors, budgetAllocation) =>
  request('/simulator/predict', {
    method: 'POST',
    body: JSON.stringify({ brand, priors, budget_allocation: budgetAllocation }),
  });

// POST /recommend
// Body:    { brand, priors, current_allocation: { [channel]: fraction } }
// Returns: { brand, priors, recommendation_text, suggested_allocation,
//            reasoning: { increase, decrease, maintain }, channel_context, bedrock_enabled }
export const fetchRecommendation = (brand, priors, currentAllocation) =>
  request('/recommend', {
    method: 'POST',
    body: JSON.stringify({ brand, priors, current_allocation: currentAllocation }),
  });
