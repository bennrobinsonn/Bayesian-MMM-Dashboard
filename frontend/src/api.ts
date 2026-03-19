/**
 * API layer with mock data fallback.
 * Tries the real FastAPI backend first; on failure, returns realistic mock data
 * so the dashboard renders beautifully without a running backend.
 */

import {
  MOCK_BRANDS,
  getMockModelResults,
  getMockSaturationData,
  getMockSimulationResult,
  getMockRecommendation,
  type BrandMeta,
  type ModelResults,
  type SaturationData,
  type SimulationResult,
  type RecommendationResult,
} from "./data/mockData";

const API_BASE = "https://lbh9jtn0q6.execute-api.us-east-1.amazonaws.com";

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchDatasets(): Promise<{ brands: BrandMeta[] }> {
  try {
    return await request("/datasets");
  } catch {
    return { brands: MOCK_BRANDS };
  }
}

export async function fetchModelResults(brand: string, priors: string): Promise<ModelResults> {
  try {
    return await request(`/model/results?brand=${brand}&priors=${priors}`);
  } catch {
    // Simulate network delay for realism
    await new Promise((r) => setTimeout(r, 600));
    return getMockModelResults(brand, priors);
  }
}

export async function fetchSaturationCurves(brand: string, priors: string): Promise<SaturationData> {
  try {
    return await request(`/model/saturation?brand=${brand}&priors=${priors}`);
  } catch {
    await new Promise((r) => setTimeout(r, 800));
    return getMockSaturationData(brand, priors);
  }
}

export async function predictBudget(
  brand: string,
  priors: string,
  budgetAllocation: Record<string, number>,
): Promise<SimulationResult> {
  try {
    return await request("/simulator/predict", {
      method: "POST",
      body: JSON.stringify({ brand, priors, budget_allocation: budgetAllocation }),
    });
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
    return getMockSimulationResult(brand, priors, budgetAllocation);
  }
}

export async function fetchRecommendation(
  brand: string,
  priors: string,
  currentAllocation: Record<string, number>,
): Promise<RecommendationResult> {
  try {
    return await request("/recommend", {
      method: "POST",
      body: JSON.stringify({ brand, priors, current_allocation: currentAllocation }),
    });
  } catch {
    await new Promise((r) => setTimeout(r, 1200));
    return getMockRecommendation(brand, priors, currentAllocation);
  }
}
