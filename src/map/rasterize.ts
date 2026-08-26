import type { RegionGrid, ViewId } from '../data/types'

/**
 * Turns an analysis grid into an image the GPU can interpolate.
 *
 * Drawing the grid as one polygon per cell is what made the layer read as a
 * blocky opaque blanket dropped on the map: 60 m squares with hard edges, fully
 * hiding the ground. Every serious thermal or air-quality map — NASA Worldview,
 * Google's air quality layer, Climate Central's heat maps — renders these as a
 * smoothly resampled, semi-transparent raster instead, so terrain reads through
 * and the field looks continuous, which is what it physically is.
 *
 * So we paint one pixel per cell into a canvas and hand MapLibre an image
 * source. `raster-resampling: linear` then does bilinear interpolation on the
 * GPU for free, and opacity lets the basemap show through.
 */

export interface Ramp {
  /** Six colours, cool to hot. */
  stops: string[]
  /** Value range the ramp spans. */
  lo: number
  hi: number
}

const hexToRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]

/**
 * Continuous colour along the ramp. The legend still shows six discrete stops
 * — those name the buckets — but the surface itself is a field, and banding it
 * into six flat plateaus is what made it look like a chart rather than a
 * measurement.
 */
function sample(stops: [number, number, number][], t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  const f = x - i
  const a = stops[i]
  const b = stops[i + 1]
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ]
}

/** Values for a view, already unquantised, or null where there is no reading. */
function valuesFor(g: RegionGrid, view: ViewId, year: number | null): (number | null)[] {
  if (view === 'heat') return g.lst.map((v) => (v === null ? null : v / 10))
  if (view === 'people') return g.pop.map((v) => (v === null ? null : v / 10))
  const y = year !== null && g.years.includes(year) ? year : g.years[g.years.length - 1]
  const nd = g.ndvi[String(y)] ?? []
  return nd.map((v) => (v === null ? null : v / 100))
}

export interface RasterResult {
  url: string
  /** Corner order MapLibre wants: top-left, top-right, bottom-right, bottom-left. */
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
}

/**
 * @param shadeOffset  Cells above `vegThreshold` also cast a dark copy of
 *                     themselves, offset by this many cells. This is the
 *                     canopy view's signature — shade drawn where shade falls.
 */
export function rasterizeGrid(
  g: RegionGrid,
  view: ViewId,
  year: number | null,
  ramp: Ramp,
  opts: { shadeOffset?: [number, number]; shadeRgb?: [number, number, number]; vegThreshold?: number } = {}
): RasterResult | null {
  const vals = valuesFor(g, view, year)
  if (!vals.length) return null

  const { cols, rows } = g
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const img = ctx.createImageData(cols, rows)
  const stops = ramp.stops.map(hexToRgb)
  const span = ramp.hi - ramp.lo || 1

  // Optional cast shade, painted first so the canopy sits on top of it.
  if (opts.shadeOffset && opts.vegThreshold !== undefined) {
    const [dx, dy] = opts.shadeOffset
    const [sr, sg, sb] = opts.shadeRgb ?? [0, 0, 0]
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = vals[r * cols + c]
        if (v === null || v < opts.vegThreshold) continue
        const tr = r + dy
        const tc = c + dx
        if (tr < 0 || tr >= rows || tc < 0 || tc >= cols) continue
        const o = (tr * cols + tc) * 4
        img.data[o] = sr
        img.data[o + 1] = sg
        img.data[o + 2] = sb
        img.data[o + 3] = 150
      }
    }
  }

  for (let i = 0; i < vals.length; i++) {
    const v = vals[i]
    const o = i * 4
    if (v === null) {
      // Leave truly missing cells transparent — a gap must read as a gap.
      img.data[o + 3] = 0
      continue
    }
    const [r, gg, b] = sample(stops, (v - ramp.lo) / span)
    img.data[o] = r
    img.data[o + 1] = gg
    img.data[o + 2] = b
    img.data[o + 3] = 255
  }

  // Feather the outer cells. The rectangle is the edge of what we analysed, not
  // a measurement, and a hard pixel cut reads as a screenshot pasted on the map.
  // Two cells of falloff softens the boundary without implying data beyond it.
  const FEATHER = 2
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const d = Math.min(r, c, rows - 1 - r, cols - 1 - c)
      if (d >= FEATHER) continue
      const o = (r * cols + c) * 4
      img.data[o + 3] = Math.round(img.data[o + 3] * ((d + 1) / (FEATHER + 1)))
    }
  }

  ctx.putImageData(img, 0, 0)

  const { tl, tr, bl, br } = g.cornersWgs84
  return {
    url: canvas.toDataURL('image/png'),
    coordinates: [tl, tr, br, bl],
  }
}
