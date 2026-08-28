/**
 * What planting this actually costs.
 *
 * A map without a budget line is not a proposal, it is a picture. But the true
 * rate depends on the department, the season, the contractor and how long
 * establishment care runs for — so the default below is a **starting figure a
 * planner is expected to overwrite**, not a claim. The UI makes it editable for
 * exactly that reason, and every total recomputes from whatever they type.
 *
 * Default is a mid-range figure for a nursery sapling plus roughly three years
 * of establishment care (watering, staking, replacement of failures) at
 * Pakistani public-sector rates. Treat it as an order of magnitude.
 */

export const DEFAULT_COST_PKR = 1200

/** Larger species need bigger pits, more water and longer staking. */
export function costMultiplier(crownM: number): number {
  if (crownM >= 18) return 1.5
  if (crownM >= 12) return 1.25
  if (crownM >= 8) return 1.0
  return 0.85
}

export interface CostEstimate {
  trees: number
  totalPkr: number
  perTreePkr: number
}

export function estimateCost(
  crowns: number[],
  perTreePkr: number = DEFAULT_COST_PKR
): CostEstimate {
  const total = crowns.reduce((sum, c) => sum + perTreePkr * costMultiplier(c), 0)
  return {
    trees: crowns.length,
    totalPkr: Math.round(total),
    perTreePkr,
  }
}

/** PKR reads better as lakh/crore to a Pakistani reader than as raw digits. */
export function formatPkr(v: number): string {
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} crore`
  if (v >= 1e5) return `${(v / 1e5).toFixed(1)} lakh`
  return v.toLocaleString('en-PK')
}
