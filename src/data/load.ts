import type { FeatureCollection, Point } from 'geojson'
import type { Meta, RegionGrid, RegionId, SiteProps, ViewId } from './types'

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
export function domainFor(g: RegionGrid, view: ViewId, year: number | null): [number, number] {
  const key = `${g.region}:${view}:${view === 'canopy' ? year : ''}`
  const hit = domainMemo.get(key)
  if (hit) return hit

  let lo: number
  let hi: number
  if (view === 'heat') {
    lo = percentile(g.lst, 0.02, 10)
    hi = percentile(g.lst, 0.98, 10)
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
    const y = year !== null && g.years.includes(year) ? year : g.years[g.years.length - 1]
    lo = 0
    hi = Math.max(0.35, percentile(g.ndvi[String(y)] ?? [], 0.98, 100))
  } else {
    // Priority is filled in by domainForScores() once the site list is loaded;
    // these are only a placeholder for the moment before that happens.
    lo = 0.25
    hi = 0.95
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
