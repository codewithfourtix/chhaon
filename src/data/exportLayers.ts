import { rasterizeGrid, type Ramp } from '../map/rasterize'
import { riskBand, riskFor } from './risk'
import type { RegionGrid, ViewId } from './types'

/**
 * Full-layer export, for a department that already has a GIS.
 *
 * The ranked sites export as points, which is what a planner wants. This is the
 * other half: the measured rasters themselves, so an analyst can pull the
 * analysis into QGIS or ArcGIS and work with it rather than being locked into
 * our interface.
 *
 * Two formats, because they answer different questions:
 *
 *   - **Grid GeoJSON** — one polygon per 60 m cell carrying every measured
 *     value. Loads directly, joins, filters, symbolises. This is the useful one.
 *   - **PNG + world file** — the rendered layer as a georeferenced raster.
 *     Written from the same canvas the map draws, so what lands in QGIS is
 *     exactly what was on screen. GeoTIFF would need an encoder we would have to
 *     ship; a world file is two lines of text and every GIS reads it.
 */

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Bilinear interpolation across the grid's four WGS84 corners. */
function corners(g: RegionGrid) {
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

const LANDUSE = ['none', 'roadside', 'vacant', 'canal', 'park']

/**
 * Every measured layer, one feature per cell.
 *
 * Cells with no reading at all are dropped rather than exported as zero — a gap
 * has to stay a gap once it is in someone else's GIS, where our caveats are not.
 */
export function downloadGridGeoJson(g: RegionGrid) {
  const at = corners(g)
  const { values: risk } = riskFor(g)
  const features: unknown[] = []

  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const i = r * g.cols + c
      const props: Record<string, number | string | null> = {
        landuse: LANDUSE[g.landuse[i]] ?? 'none',
        built: g.built[i] ? 1 : 0,
      }
      let any = false

      for (const y of g.years) {
        const v = g.ndvi[String(y)]?.[i]
        if (v !== null && v !== undefined) {
          props[`ndvi_${y}`] = v / 100
          any = true
        }
      }
      const lst = g.lst[i]
      if (lst !== null && lst !== undefined) {
        props.surface_temp_c = lst / 10
        props.heat_above_baseline_c = Number((lst / 10 - g.baselineC).toFixed(1))
        any = true
      }
      const pop = g.pop[i]
      if (pop !== null && pop !== undefined) {
        props.people_per_ha = pop / 10
        any = true
      }
      const rv = risk[i]
      if (rv !== null) {
        props.risk_value = Number(rv.toFixed(3))
        props.risk_band = riskBand(rv)
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

  save(
    new Blob([JSON.stringify({
      type: 'FeatureCollection',
      name: `chhaon-${g.region}-grid`,
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3/CRS84' } },
      features,
    })], { type: 'application/geo+json' }),
    `chhaon-${g.region}-grid.geojson`
  )
}

/**
 * The rendered layer as a georeferenced raster: a PNG plus its world file.
 *
 * The world file assumes north-up, which is true enough here — over a few
 * kilometres near the UTM zone's central meridian the grid's rotation is far
 * below the 60 m cell size.
 */
export async function downloadGeoPng(
  g: RegionGrid,
  view: ViewId,
  year: number | null,
  ramp: Ramp
) {
  const raster = rasterizeGrid(g, view, year, ramp)
  if (!raster) return

  const [[wLon, nLat], , [eLon, sLat]] = [
    raster.coordinates[0], raster.coordinates[1], raster.coordinates[2],
  ]
  const dx = (eLon - wLon) / g.cols
  const dy = (sLat - nLat) / g.rows

  // ESRI world file: x scale, y skew, x skew, y scale, x and y of the CENTRE
  // of the top-left pixel.
  const pgw = [dx, 0, 0, dy, wLon + dx / 2, nLat + dy / 2]
    .map((n) => n.toFixed(10))
    .join('\n')

  const blob = await (await fetch(raster.url)).blob()
  save(blob, `chhaon-${g.region}-${view}.png`)
  save(new Blob([pgw], { type: 'text/plain' }), `chhaon-${g.region}-${view}.pgw`)
}
