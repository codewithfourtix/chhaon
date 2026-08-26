import type { Feature, FeatureCollection, Point, Polygon } from 'geojson'
import type { Meta, RegionGrid, RegionId, SiteProps } from './types'

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

/** Cell polygons for a region, built once and shared by every caller. */
export const loadCells = (region: RegionId) =>
  once(`cells:${region}`, async () => gridToCells(await loadGrid(region)))

export const loadSites = (region: RegionId) =>
  once(`sites:${region}`, () =>
    getJSON<FeatureCollection<Point, SiteProps>>(`data/${region}-sites.json`)
  )

/**
 * The analysis grid is metric (UTM), so its cells are not axis-aligned in
 * lon/lat. Rather than ship a projection library, the pipeline emits the grid's
 * four WGS84 corners and we interpolate between them. Over a few kilometres
 * near the UTM zone's central meridian the error is well under a metre.
 */
function cornerInterpolator(g: RegionGrid) {
  const { tl, tr, bl, br } = g.cornersWgs84
  return (u: number, v: number): [number, number] => {
    const a = (1 - u) * (1 - v)
    const b = u * (1 - v)
    const c = (1 - u) * v
    const d = u * v
    return [
      tl[0] * a + tr[0] * b + bl[0] * c + br[0] * d,
      tl[1] * a + tr[1] * b + bl[1] * c + br[1] * d,
    ]
  }
}

/**
 * Turn the compact quantised arrays into map-ready cell polygons.
 *
 * Cells with no usable observation in *any* layer are dropped rather than
 * drawn as zero — a gap in the data must read as a gap, never as a measurement.
 */
export function gridToCells(g: RegionGrid): FeatureCollection<Polygon> {
  const at = cornerInterpolator(g)
  const features: Feature<Polygon>[] = []

  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const i = r * g.cols + c
      const lst = g.lst[i]
      const pop = g.pop[i]

      const props: Record<string, number | string> = {
        landuse: g.landuse[i],
        built: g.built[i],
      }
      let any = false

      for (const y of g.years) {
        const v = g.ndvi[String(y)]?.[i]
        if (v !== null && v !== undefined) {
          props[`n${y}`] = v / 100
          any = true
        }
      }
      if (lst !== null && lst !== undefined) {
        props.lst = lst / 10
        any = true
      }
      if (pop !== null && pop !== undefined) {
        props.pop = pop / 10
        any = true
      }
      if (!any) continue

      const u0 = c / g.cols
      const u1 = (c + 1) / g.cols
      const v0 = r / g.rows
      const v1 = (r + 1) / g.rows
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1), at(u0, v0)]],
        },
        properties: props,
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

/** Percentile of the finite values in a quantised grid, for legend ends. */
export function percentile(grid: (number | null)[], p: number, scale: number): number {
  const vals = grid.filter((v): v is number => v !== null).sort((a, b) => a - b)
  if (!vals.length) return 0
  return vals[Math.min(vals.length - 1, Math.floor((vals.length - 1) * p))] / scale
}
