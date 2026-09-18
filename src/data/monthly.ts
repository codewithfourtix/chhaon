import type { RegionId } from './types'

/**
 * The monthly series: green cover at a cadence you can act on.
 *
 * Written by `pipeline/monthly.py`. The product now carries two cadences and keeps
 * them apart on purpose:
 *
 *   2017-2024   yearly, locked to one spring window   for comparing years
 *   2024-2026   monthly composites                    for knowing what is now
 *
 * They are never drawn as one line. The annual window is season-locked precisely
 * because a spring reading and a September reading are not comparable points, so
 * joining them would undo the one control that makes the yearly series mean
 * anything.
 *
 * **A monthly series shows the season.** Vegetation in Lahore moves with the
 * monsoon and the winter rain — Model Town runs about 56% vegetated in October,
 * 31% by June, and back to 58% the following September. A fall across those months
 * is the year turning, not trees coming down. The comparison that carries meaning
 * is the same month a year apart, which is what 24 months buys.
 *
 * Months with no raster are still in the series, with their reason. A gap nobody
 * can explain looks like a bug; a gap with a reason is a finding — and here the
 * finding is that Lahore is unreadable from orbit for about a third of the year.
 */

export interface MonthlyPeriod {
  /** 'YYYY-MM'. */
  period: string
  /** Scenes composited, or how many were available when too few. */
  scenes: number
  usable: boolean
  /** Why there is no raster. Present exactly when `usable` is false. */
  reason: string | null
  coverage: number | null
  vegPct: number | null
  meanNdvi: number | null
  dates: string[]
}

export interface MonthlyDoc {
  region: RegionId
  name: string
  generated: string
  months: number
  minScenes: number
  minCoverage: number
  smogMonths: number[]
  periods: MonthlyPeriod[]
  usableCount: number
  latestUsable: string | null
}

const memo = new Map<RegionId, Promise<MonthlyDoc | null>>()

/**
 * Load one region's monthly summary — the numbers only, no rasters.
 *
 * Small enough to fetch eagerly and draw a chart from immediately; the per-month
 * grids are loaded lazily by the same machinery as the years, and only when the
 * scrubber actually asks for one.
 *
 * Resolves to null when the file is absent, which is the normal state before
 * `pipeline/monthly.py` has run — not an error.
 */
export function loadMonthly(region: RegionId): Promise<MonthlyDoc | null> {
  const hit = memo.get(region)
  if (hit) return hit

  const task = fetch(`data/${region}-monthly.json`)
    .then(async (res) => {
      if (!res.ok) return null
      if (!(res.headers.get('content-type') ?? '').includes('json')) return null
      return (await res.json()) as MonthlyDoc
    })
    .catch(() => null)

  memo.set(region, task)
  return task
}

/** Months that carry a raster, oldest first — the ones the scrubber can show. */
export const usableMonths = (doc: MonthlyDoc | null) =>
  (doc?.periods ?? []).filter((p) => p.usable)

/** 'Sep 2026' — short enough for a tick, unambiguous across a year boundary. */
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
export function monthLabel(period: string): string {
  const m = Number(period.slice(5, 7))
  return `${MONTH_NAMES[m - 1] ?? '??'} ${period.slice(0, 4)}`
}

/**
 * The same month a year earlier, if the series holds it.
 *
 * This is the only year-on-year comparison a monthly series can make honestly:
 * September against September, not September against June.
 */
export function yearOnYear(doc: MonthlyDoc | null, period: string): MonthlyPeriod | null {
  if (!doc) return null
  const prior = `${Number(period.slice(0, 4)) - 1}-${period.slice(5, 7)}`
  return doc.periods.find((p) => p.period === prior && p.usable) ?? null
}

/**
 * How much of the window we could not see, and why.
 *
 * Stated rather than left as blank space: roughly a third of the Lahore year is
 * unreadable from orbit, which is itself worth knowing and is the kind of thing a
 * reader will otherwise assume is a bug in the chart.
 */
export function blindSpots(doc: MonthlyDoc): { smog: number; thin: number; partial: number } {
  const unusable = doc.periods.filter((p) => !p.usable)
  return {
    smog: unusable.filter((p) => p.reason?.startsWith('smog')).length,
    thin: unusable.filter((p) => p.reason?.includes('needed to composite')).length,
    partial: unusable.filter((p) => p.reason?.includes('visible')).length,
  }
}
