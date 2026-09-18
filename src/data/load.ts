import { useSyncExternalStore } from 'react'
import type { FeatureCollection, Point } from 'geojson'
import type { HeatLayer, Meta, QGrid, RegionGrid, RegionId, SiteProps, ViewId } from './types'

/**
 * Loads the pipeline's output. Everything is a static file committed to the
 * repo — there is no API here, and nothing can time out during a demo.
 */

const memo = new Map<string, Promise<unknown>>()

function once<T>(key: string, make: () => Promise<T>): Promise<T> {
  if (!memo.has(key)) memo.set(key, make())
  return memo.get(key) as Promise<T>
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path} — ${res.status} ${res.statusText}`)
  // A dev server answers missing files with index.html, which then fails to
  // parse with a message that says nothing useful. Check the type first so the
  // real problem ("the pipeline has not been run") reaches the screen.
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('json')) {
    throw new Error(`${path} is missing — run \`python pipeline/run.py\` to generate it`)
  }
  return res.json() as Promise<T>
}

export const loadMeta = () => once('meta', () => getJSON<Meta>('data/meta.json'))

export const loadGrid = (region: RegionId) =>
  once(`grid:${region}`, () => getJSON<RegionGrid>(`data/${region}.json`))

export const loadSites = (region: RegionId) =>
  once(`sites:${region}`, () =>
    getJSON<FeatureCollection<Point, SiteProps>>(`data/${region}-sites.json`)
  )

/* --------------------------------------------------------------------------
 * NDVI years, loaded as they are needed
 * --------------------------------------------------------------------------
 *
 * The core grid file carries only the latest year. Earlier years are separate
 * files, because the app draws one year at a time and shipping all nine tripled
 * first paint — 105 KB of DHA's 144 KB gzip was eight years nobody had asked
 * for. First paint is now ~53 KB.
 *
 * Two rules from .claude/skills/map-performance/SKILL.md are in tension here:
 * "the map must be interactive before the data arrives" wants the smallest
 * possible first fetch, and "filter, do not refetch — swapping datasets per
 * year re-parses on every drag frame" wants every year already in memory. Both
 * are satisfied by fetching the visible year on demand and then prefetching the
 * rest at idle: the scrubber is never the thing waiting on the network, because
 * by the time anyone drags it the years are cached.
 *
 * Years land in the grid object itself, which is memoised per region and so
 * shared by every consumer. Components learn about it through `useNdviYears()`,
 * a version counter — React cannot see a mutation on its own.
 */

let ndviVersion = 0
const ndviListeners = new Set<() => void>()

function bumpNdvi() {
  ndviVersion++
  for (const fn of ndviListeners) fn()
}

/** Re-renders when a year of NDVI finishes loading. */
export function useNdviYears(): number {
  return useSyncExternalStore(
    (fn) => {
      ndviListeners.add(fn)
      return () => ndviListeners.delete(fn)
    },
    () => ndviVersion,
    () => ndviVersion
  )
}

interface PeriodDoc {
  region: RegionId
  /** '2018' for a season-locked year, '2026-06' for a calendar month. */
  period?: string
  year?: number
  cols: number
  rows: number
  ndvi: QGrid
}

/**
 * Where one NDVI layer lives. Keep in sync with `period_path` in split_years.py.
 *
 * Two cadences share `grid.ndvi`, keyed by the period string, because they are the
 * same shape of thing — a grid of vegetation index over this region — and keeping
 * them in one map means the raster code needs no idea which cadence it is drawing.
 * What must never happen is plotting them as one *series*: a spring-locked annual
 * reading and a September monthly reading are not comparable points, which is the
 * entire reason the annual window is locked.
 */
export const isMonthly = (period: string) => period.includes('-')

const periodUrl = (region: RegionId, period: string) =>
  `data/${region}-ndvi-${isMonthly(period) ? 'm-' : ''}${period}.json`

/**
 * The period key the canopy layer should be drawing, given the cadence.
 *
 * One helper so the map, the legend, the scrubber and the export cannot disagree
 * about which layer is on screen — the same reason `domainFor` is shared.
 */
export const activePeriod = (
  cadence: 'yearly' | 'monthly',
  year: number | null,
  month: string | null
): string | null => (cadence === 'monthly' ? month : year === null ? null : String(year))

/**
 * Keyed by region and year, holding the actual promise rather than a flag — so a
 * second caller joins the existing fetch instead of resolving early on a year
 * that has not landed yet. The scrubber asks for the same year repeatedly during
 * a drag, and the export waits on all of them at once.
 */
const inFlight = new Map<string, Promise<void>>()

/**
 * Ensure one period of NDVI is in `grid.ndvi`.
 *
 * `period` is '2018' for a season-locked year or '2026-06' for a calendar month.
 */
export function loadNdviPeriod(g: RegionGrid, period: string): Promise<void> {
  const key = String(period)
  if (g.ndvi[key]) return Promise.resolve()

  const memoKey = `ndvi:${g.region}:${key}`
  const joined = inFlight.get(memoKey)
  if (joined) return joined

  const task = getJSON<PeriodDoc>(periodUrl(g.region, key))
    .then((doc) => {
      // A stale split would otherwise paint one region's values through another
      // region's corners, which looks like real data and is not.
      if (doc.cols !== g.cols || doc.rows !== g.rows) {
        throw new Error(
          `${periodUrl(g.region, key)} is ${doc.cols}x${doc.rows}, ` +
            `but the grid is ${g.cols}x${g.rows} — regenerate it`
        )
      }
      g.ndvi[key] = doc.ndvi
      bumpNdvi()
    })
    .catch((e: unknown) => {
      // A year that will not load must not take the map down: the layer keeps
      // showing the year it has. Logged rather than thrown for that reason.
      console.error('[ndvi]', e)
    })
    .finally(() => {
      inFlight.delete(memoKey)
      bumpNdvi()
    })

  inFlight.set(memoKey, task)
  bumpNdvi()
  return task
}

/**
 * Whether a year the user is waiting on is in flight.
 *
 * Deliberately ignores the idle prefetch: showing a progress hairline for eight
 * background fetches nobody asked for would mean the map looks permanently busy
 * for the first minute. Only a year that is actually being displayed counts.
 */
export const ndviPending = (region: RegionId, period: string | number | null) =>
  period !== null && inFlight.has(`ndvi:${region}:${period}`)

/** The yearly caller's name for the same thing. */
export const loadNdviYear = (g: RegionGrid, year: number) =>
  loadNdviPeriod(g, String(year))

/** True once every year the region claims is in memory. */
export const allYearsLoaded = (g: RegionGrid) => g.years.every((y) => !!g.ndvi[String(y)])

/**
 * Wait for every year. Used before exporting the full grid, which writes one
 * column per year — exporting only the years that happened to be cached would
 * hand someone a file that is quietly missing measurements.
 */
export async function ensureAllNdviYears(g: RegionGrid): Promise<void> {
  await Promise.all(g.years.map((y) => loadNdviYear(g, y)))
}

/**
 * Pull the remaining years in the background, one at a time, at the lowest
 * priority the platform offers. Sequential on purpose: eight parallel fetches
 * on a 3G connection compete with the basemap tiles the user is actually
 * looking at.
 */
export function prefetchNdviYears(g: RegionGrid): void {
  const idle: (cb: () => void) => void =
    typeof requestIdleCallback === 'function'
      ? (cb) => requestIdleCallback(() => cb(), { timeout: 4000 })
      : (cb) => void setTimeout(cb, 600)

  const missing = g.years.filter((y) => !g.ndvi[String(y)])
  const next = () => {
    const y = missing.shift()
    if (y === undefined) return
    loadNdviYear(g, y).then(() => idle(next))
  }
  idle(next)
}

/* --------------------------------------------------------------------------
 * Surface temperature per year
 * --------------------------------------------------------------------------
 *
 * Heat used to be one Landsat scene drawn under every year, so clicking 2017 in
 * the Heat or Risk view changed nothing. pipeline/heat_years.py now writes one
 * clear summer scene per year; the latest stays inline in the core file, the
 * rest are fetched the way NDVI years are, and share the same version counter.
 *
 * Each year is one morning, so its absolute °C carry that day's weather.
 * Nothing here compares °C across years: the colour ramp spans each year's own
 * range, and risk measures heat above the baseline *of the same scene*.
 */

/**
 * The year whose heat is on screen.
 *
 * Yearly: the selected year. Monthly: the latest year — there is no monthly heat
 * (Landsat passes every 8–16 days, and smog and monsoon cloud would leave most
 * months empty), which the readout says.
 */
export function heatYear(g: RegionGrid, period: string | null): number {
  const latest = g.years[g.years.length - 1]
  if (!period || isMonthly(period)) return latest
  const y = Number(period)
  return g.years.includes(y) ? y : latest
}

/** That year's heat, or null until it has loaded (or if it has no clear scene). */
export function heatLayer(g: RegionGrid, year: number): HeatLayer | null {
  const hit = g.lstYears?.[String(year)]
  if (hit) return hit
  if (year === g.years[g.years.length - 1]) return { lst: g.lst, baselineC: g.baselineC }
  return null
}

interface LstDoc {
  region: RegionId
  year: number
  cols: number
  rows: number
  lst: QGrid
  baselineC: number
}

/** Years with no clear summer scene, so the map stops asking and says so. */
const lstMissing = new Set<string>()

export const heatMissing = (region: RegionId, year: number) =>
  lstMissing.has(`${region}:${year}`)

export function loadLstYear(g: RegionGrid, year: number): Promise<void> {
  if (heatLayer(g, year) || heatMissing(g.region, year)) return Promise.resolve()
  const memoKey = `lst:${g.region}:${year}`
  const joined = inFlight.get(memoKey)
  if (joined) return joined

  const url = `data/${g.region}-lst-${year}.json`
  const task = getJSON<LstDoc>(url)
    .then((doc) => {
      if (doc.cols !== g.cols || doc.rows !== g.rows) {
        throw new Error(`${url} is ${doc.cols}x${doc.rows}, but the grid is ` +
          `${g.cols}x${g.rows} — regenerate it`)
      }
      g.lstYears = { ...g.lstYears, [String(year)]: { lst: doc.lst, baselineC: doc.baselineC } }
    })
    .catch((e: unknown) => {
      // Missing means no clear scene that year (or heat_years.py not yet run).
      // Shown as a gap, never filled in from a neighbouring year.
      lstMissing.add(`${g.region}:${year}`)
      console.error('[lst]', e)
    })
    .finally(() => {
      inFlight.delete(memoKey)
      bumpNdvi()
    })

  inFlight.set(memoKey, task)
  bumpNdvi()
  return task
}

export const lstPending = (region: RegionId, year: number) =>
  inFlight.has(`lst:${region}:${year}`)

/** Background fill for heat, after the NDVI years, one at a time. */
export function prefetchLstYears(g: RegionGrid): void {
  const missing = g.years.filter((y) => !heatLayer(g, y))
  const next = () => {
    const y = missing.shift()
    if (y === undefined) return
    loadLstYear(g, y).then(() => setTimeout(next, 300))
  }
  next()
}

const median = (v: number[]) => {
  if (!v.length) return NaN
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * How much cooler shaded ground ran than bare ground, in one year's scene.
 *
 * The same measurement run.py makes for the latest year (median of NDVI < 0.15
 * minus median of NDVI ≥ 0.45, same scene), so it is comparable across years in
 * a way absolute temperature is not: both halves share that morning's weather.
 */
export function shadeGapC(g: RegionGrid, year: number): number | null {
  const h = heatLayer(g, year)
  const nd = g.ndvi[String(year)]
  if (!h || !nd) return null
  const bare: number[] = []
  const veg: number[] = []
  for (let i = 0; i < h.lst.length; i++) {
    const t = h.lst[i]
    const n = nd[i]
    if (t === null || n === null) continue
    if (n < 15) bare.push(t / 10)
    else if (n >= 45) veg.push(t / 10)
  }
  if (bare.length <= 30 || veg.length <= 30) return null
  return median(bare) - median(veg)
}

/** Percentile of the finite values in a quantised grid. */
export function percentile(grid: (number | null)[], p: number, scale: number): number {
  const vals = grid.filter((v): v is number => v !== null).sort((a, b) => a - b)
  if (!vals.length) return 0
  return vals[Math.min(vals.length - 1, Math.floor((vals.length - 1) * p))] / scale
}

const domainMemo = new Map<string, [number, number]>()

/**
 * The value range a view's colour ramp should span, taken from the data itself.
 *
 * Hard-coded domains are how a real layer ends up looking like a flat wash:
 * population here runs 101–162 people/ha, so a 0–400 domain put every cell
 * within 8% of every other one. Clipping to p2–p98 spends the whole ramp on the
 * range the data actually occupies, and the legend reads from this same
 * function so the two can never disagree.
 */
export function domainFor(
  g: RegionGrid,
  view: ViewId,
  period: string | null,
  /**
   * Every ranked score in the region, required for the `priority` view.
   *
   * Priority's domain cannot be derived from the grid — it comes from the site
   * list — and for a while that meant the map coloured its circles from the real
   * score range while the legend printed the placeholder below it. In Model Town
   * the legend read 0.25–0.95 against actual scores of 0.33–0.80; in DHA,
   * 0.50–0.69. Threading the scores through here is what makes the claim in
   * docs/PRODUCT.md §3.6 — that the map and the legend read the same function and
   * so cannot drift apart — true for all five views rather than four.
   */
  scores?: number[]
): [number, number] {
  const key = `${g.region}:${view}:${
    view === 'canopy' ? period : view === 'heat' ? heatYear(g, period) : ''}`
  const hit = domainMemo.get(key)
  if (hit) return hit

  let lo: number
  let hi: number
  if (view === 'heat') {
    // That year's own range. Each year is one morning, so a shared scale would
    // colour a hotter day as a hotter neighbourhood.
    const h = heatLayer(g, heatYear(g, period))
    if (!h) return [percentile(g.lst, 0.02, 10), percentile(g.lst, 0.98, 10)]
    lo = percentile(h.lst, 0.02, 10)
    hi = percentile(h.lst, 0.98, 10)
  } else if (view === 'people') {
    lo = percentile(g.pop, 0.02, 10)
    hi = percentile(g.pop, 0.98, 10)
  } else if (view === 'risk') {
    // Risk is already normalised, and its band edges are fixed — clipping it to
    // the data would move the bands from region to region and make "High" mean
    // something different in each one.
    lo = 0
    hi = 1
  } else if (view === 'canopy') {
    const vals = g.ndvi[period ?? String(g.years[g.years.length - 1])]
    lo = 0
    // A year still in flight has no values yet, and memoising a domain derived
    // from nothing would pin the legend to a wrong range for the rest of the
    // session. Fall back to the latest year — which is always inline — and do
    // not cache, so the real domain is computed once the year lands.
    if (!vals) {
      const fallback = g.ndvi[String(g.years[g.years.length - 1])] ?? []
      return [0, Math.max(0.35, percentile(fallback, 0.98, 100))]
    }
    hi = Math.max(0.35, percentile(vals, 0.98, 100))
  } else {
    // Priority: the ranking's own spread. Not memoised when the site list has
    // not arrived, or the placeholder below would be pinned for the session and
    // the legend would go on disagreeing with the map after the data landed.
    if (!scores?.length) return [0.25, 0.95]
    ;[lo, hi] = domainForScores(scores)
  }
  // Never hand back a zero-width domain — a flat ramp is worse than a wrong one.
  if (!(hi > lo)) hi = lo + 1
  const out: [number, number] = [lo, hi]
  domainMemo.set(key, out)
  return out
}

/**
 * Priority's domain comes from the ranked sites themselves.
 *
 * Their scores occupy a narrow band (0.66–0.80 in Model Town), so a fixed
 * 0.25–0.95 ramp put all forty into two of six buckets and every pin came out
 * the same colour — you could not tell the top site from the fortieth.
 */
export function domainForScores(scores: number[]): [number, number] {
  if (!scores.length) return [0.25, 0.95]
  const v = [...scores].sort((a, b) => a - b)
  const lo = v[0]
  const hi = v[v.length - 1]
  return hi > lo ? [lo, hi] : [lo, lo + 1]
}

/** Five interior breakpoints for a six-stop ramp across [lo, hi]. */
export const rampBreaks = (lo: number, hi: number) =>
  [1, 2, 3, 4, 5].map((i) => lo + ((hi - lo) * i) / 6)
