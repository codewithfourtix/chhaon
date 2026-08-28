import type { RegionGrid } from './types'

/**
 * Heat-and-shade-deficit risk, in four discrete bands.
 *
 * No new data: this is `lst`, `ndvi` and the region's own vegetated baseline,
 * already computed, relabelled into the language a planner or an EPA officer
 * actually writes reports in. A continuous ramp says "somewhat hot"; a band
 * says "High risk", and only one of those ends up in a document.
 *
 * Deliberately discrete, and deliberately defined once — the map, the legend
 * and the summary statistic all read from here, so they cannot drift apart.
 */

export const RISK_BANDS = ['Low', 'Medium', 'High', 'Critical'] as const
export type RiskBand = (typeof RISK_BANDS)[number]

/** Upper edges of Low, Medium, High. Anything above is Critical. */
export const RISK_EDGES = [0.28, 0.46, 0.64]

export const RISK_COLOURS = {
  light: ['#BFD4CE', '#E9C88E', '#C56836', '#7A1A18'],
  dark: ['#2F4A44', '#9A7A3C', '#C4652C', '#F05A4A'],
}

/**
 * 0..1 risk for one cell.
 *
 * Weighted toward heat because heat is what the product measures directly and
 * what the intervention addresses; canopy absence is the mechanism.
 */
export function riskValue(lstC: number, ndvi: number, baselineC: number): number {
  const heat = Math.max(0, Math.min(1, (lstC - baselineC) / 8))
  const bare = Math.max(0, Math.min(1, (0.45 - ndvi) / 0.45))
  return 0.6 * heat + 0.4 * bare
}

export function riskBand(v: number): RiskBand {
  if (v < RISK_EDGES[0]) return 'Low'
  if (v < RISK_EDGES[1]) return 'Medium'
  if (v < RISK_EDGES[2]) return 'High'
  return 'Critical'
}

export interface RiskSummary {
  /** Share of assessed cells in each band, 0..1, in RISK_BANDS order. */
  shares: number[]
  /** Share that is High or Critical — the number worth quoting. */
  elevated: number
  assessed: number
}

const memo = new Map<string, RiskSummary>()

/** Per-cell risk for the region's most recent year, plus the band breakdown. */
export function riskFor(g: RegionGrid): { values: (number | null)[]; summary: RiskSummary } {
  const year = g.years[g.years.length - 1]
  const nd = g.ndvi[String(year)] ?? []
  const counts = [0, 0, 0, 0]
  let assessed = 0

  const values = g.lst.map((raw, i) => {
    const ndviRaw = nd[i]
    if (raw === null || raw === undefined || ndviRaw === null || ndviRaw === undefined) {
      return null
    }
    const v = riskValue(raw / 10, ndviRaw / 100, g.baselineC)
    counts[RISK_BANDS.indexOf(riskBand(v))]++
    assessed++
    return v
  })

  const key = g.region
  let summary = memo.get(key)
  if (!summary) {
    summary = {
      shares: counts.map((n) => (assessed ? n / assessed : 0)),
      elevated: assessed ? (counts[2] + counts[3]) / assessed : 0,
      assessed,
    }
    memo.set(key, summary)
  }
  return { values, summary }
}
