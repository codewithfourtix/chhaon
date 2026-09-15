import type { LossEvent } from './recent'
import type { Box } from '../state/store'
import type { RegionId } from './types'

/**
 * Watched areas, and the alerts they raise.
 *
 * The design constraint that matters most here is **not alerting on everything**.
 * A monitor that fires on every flicker gets muted within a week, and a muted
 * monitor is worse than none because it looks like coverage. So:
 *
 *   - A watch is a *drawn area*, not a whole region. "Somewhere in Lahore" is not
 *     something anyone can act on.
 *   - Every watch carries its own threshold, defaulting to a change big enough to
 *     stand in — see DEFAULT_MIN_CELLS.
 *   - An alert is raised once. Acknowledging it keeps it in the record but stops
 *     it competing with the next one.
 *   - Only *usable* passes can raise an alert, which the pipeline has already
 *     enforced by excluding smog season from detection.
 *
 * Who this is for: a journalist watching one contested plot, an NGO watching a
 * green belt, someone assembling evidence for a petition. All three need "tell me
 * about this specific place", not a feed.
 *
 * Stored in localStorage — small, text-only, and per-device by nature. There is
 * no server to push from, and the panel says so rather than implying a
 * notification will arrive while the tab is closed.
 */

export const DEFAULT_MIN_DROP = 0.15
/**
 * Three 60 m cells, about 1.1 ha. Matches the pipeline's own floor: below this a
 * cluster is inside what noise, a shadow or a mown lawn can produce.
 */
export const DEFAULT_MIN_CELLS = 3

export interface Watch {
  id: string
  /** What the user calls this place. */
  name: string
  region: RegionId
  area: Box
  minDropNdvi: number
  minCells: number
  createdAt: string
  /** Event ids the user has already seen and dismissed. */
  acknowledged: string[]
}

const KEY = 'chhaon-watches-v1'

export function loadWatches(): Watch[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Watch[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Private browsing, cleared storage, or a shape from a previous version.
    // An empty list is the right degradation; the app must not go down with it.
    return []
  }
}

export function saveWatches(list: Watch[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch (e) {
    console.error('[watches] could not persist', e)
  }
}

export const newWatchId = () =>
  `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

/** Does this event fall inside the watched box? */
export const inArea = (e: LossEvent, a: Box) =>
  e.lon >= a.w && e.lon <= a.e && e.lat >= a.s && e.lat <= a.n

export interface WatchAlerts {
  watch: Watch
  /** Events over threshold inside the area, biggest first. */
  matched: LossEvent[]
  /** Of those, the ones not yet acknowledged. */
  unseen: LossEvent[]
  /** Total ground area flagged, m². */
  areaM2: number
}

/**
 * Evaluate one watch against a region's detected events.
 *
 * Pure, so the thresholds can be checked without a browser — the rules that
 * decide whether the product tells someone trees came down are worth testing
 * directly.
 */
export function evaluate(watch: Watch, events: LossEvent[]): WatchAlerts {
  const matched = events
    .filter(
      (e) =>
        inArea(e, watch.area) &&
        e.dropNdvi >= watch.minDropNdvi &&
        e.cells >= watch.minCells
    )
    .sort((a, b) => b.cells - a.cells)

  const ack = new Set(watch.acknowledged)
  return {
    watch,
    matched,
    unseen: matched.filter((e) => !ack.has(e.id)),
    areaM2: matched.reduce((s, e) => s + e.areaM2, 0),
  }
}

/** Hectares, the unit anyone discussing land in Pakistan actually uses. */
export const ha = (m2: number) => m2 / 10_000

/**
 * A watch created from a drawn box. The name defaults to something recognisable
 * rather than "Watch 1" — a list of numbered watches is unusable after three.
 */
export function watchFromArea(region: RegionId, regionName: string, area: Box): Watch {
  return {
    id: newWatchId(),
    name: `${regionName} — ${area.n.toFixed(3)}, ${area.w.toFixed(3)}`,
    region,
    area,
    minDropNdvi: DEFAULT_MIN_DROP,
    minCells: DEFAULT_MIN_CELLS,
    createdAt: new Date().toISOString(),
    acknowledged: [],
  }
}
