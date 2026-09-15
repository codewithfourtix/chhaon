import type { RegionId } from './types'

/**
 * Recent Sentinel-2 passes and the sudden losses they show.
 *
 * Written by `pipeline/recent.py`, which is the fast half of the pipeline and
 * meant to run on a schedule. Deliberately a different analysis from the yearly
 * layers:
 *
 *   yearly composites  one fixed spring window a year, multi-scene, for
 *                      comparing 2017 with 2025
 *   recent passes      every usable pass in a rolling window, single-scene, for
 *                      catching a change while it is still news
 *
 * They are never mixed in the UI either. A single pass cannot carry a multi-year
 * claim, and a yearly composite cannot date an event.
 */

export interface SatellitePass {
  id: string
  /** ISO date of the overpass. */
  date: string
  cloud: number
  usable: boolean
  /** Why it is unusable. Present exactly when `usable` is false. */
  reason: string | null
  coverage: number | null
  vegPct: number | null
  meanNdvi: number | null
}

export interface LossEvent {
  id: string
  lon: number
  lat: number
  cells: number
  areaM2: number
  beforeNdvi: number
  afterNdvi: number
  dropNdvi: number
  beforeDate: string
  afterDate: string
  severity: 'severe' | 'notable'
}

export interface RecentDoc {
  region: RegionId
  name: string
  generated: string
  windowDays: number
  thresholds: {
    dropNdvi: number
    wasVegetated: number
    minCells: number
    minCoverage: number
    /** How many recent passes form the "before" reading. */
    baselinePasses?: number
    /** Share of the recent median vegetated fraction below which a pass is
     *  rejected as haze rather than believed as ground change. */
    sceneHazeRatio?: number
  }
  smogMonths: number[]
  passes: SatellitePass[]
  latestUsable: string | null
  usableCount: number
  events: LossEvent[]
}

const memo = new Map<RegionId, Promise<RecentDoc | null>>()

/**
 * Load one region's recent-pass file.
 *
 * Resolves to null when the file is absent, which is the normal state before
 * `pipeline/recent.py` has been run — not an error. The UI says so in words
 * rather than showing an empty list that looks like "no trees were lost".
 */
export function loadRecent(region: RegionId): Promise<RecentDoc | null> {
  const hit = memo.get(region)
  if (hit) return hit

  const task = fetch(`data/${region}-recent.json`)
    .then(async (res) => {
      if (!res.ok) return null
      if (!(res.headers.get('content-type') ?? '').includes('json')) return null
      return (await res.json()) as RecentDoc
    })
    .catch(() => null)

  memo.set(region, task)
  return task
}

/** How stale the newest usable observation is, in days. */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const then = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(then)) return null
  return Math.floor((Date.now() - then) / 86_400_000)
}

/**
 * A sentence about what the satellite can currently see.
 *
 * Smog season is called out by name because during it the honest answer is "we
 * cannot see the ground", and a user who is not told that will read the absence
 * of events as an absence of felling.
 */
export function coverageNote(doc: RecentDoc): string {
  const smog = doc.passes.filter((p) => !p.usable && p.reason?.startsWith('smog'))
  // Thin haze clears Sentinel-2's cloud mask and still depresses the vegetation
  // signal scene-wide, so a pass can be fully visible and still unusable. Counted
  // separately from smog season because it is a different reason and a user who
  // is not told either one reads "no events" as "no felling".
  const haze = doc.passes.filter((p) => !p.usable && p.reason?.includes('scene-wide'))
  const age = daysSince(doc.latestUsable)

  if (!doc.usableCount) {
    return smog.length
      ? `No usable pass in the last ${doc.windowDays} days — all ${smog.length} were in smog season, when aerosol makes the vegetation signal meaningless.`
      : `No usable pass in the last ${doc.windowDays} days.`
  }

  const base =
    age === null
      ? `${doc.usableCount} usable passes in the last ${doc.windowDays} days.`
      : `Last clear look at the ground: ${age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}, from ${doc.usableCount} usable pass${doc.usableCount === 1 ? '' : 'es'}.`

  const skipped: string[] = []
  if (smog.length) skipped.push(`${smog.length} skipped for smog season`)
  if (haze.length) {
    skipped.push(`${haze.length} rejected as haze rather than believed as sudden loss`)
  }
  return skipped.length ? `${base} ${skipped.join(', ')}.` : base
}
