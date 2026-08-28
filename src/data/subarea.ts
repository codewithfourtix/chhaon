import type { RegionGrid } from './types'

/**
 * Statistics for a drawn sub-area rather than a whole region.
 *
 * A department rarely asks about "Model Town". They ask about one ward, one
 * road corridor, the blocks around a school. This is a bounding query over the
 * raster grid that is already in memory — no new data, no server, and the same
 * numbers the region-wide panel shows, computed over fewer cells.
 */

export interface Box {
  w: number
  s: number
  e: number
  n: number
}

export interface AreaStats {
  cells: number
  areaKm2: number
  vegPctByYear: Record<number, number>
  meanLstC: number | null
  people: number | null
}

/** Cell centre in WGS84, by bilinear interpolation across the grid corners. */
function centre(g: RegionGrid, r: number, c: number): [number, number] {
  const { tl, tr, bl, br } = g.cornersWgs84
  const u = (c + 0.5) / g.cols
  const v = (r + 0.5) / g.rows
  const a = (1 - u) * (1 - v)
  const b = u * (1 - v)
  const d = (1 - u) * v
  const e = u * v
  return [
    tl[0] * a + tr[0] * b + bl[0] * d + br[0] * e,
    tl[1] * a + tr[1] * b + bl[1] * d + br[1] * e,
  ]
}

export function statsForBox(g: RegionGrid, box: Box | null): AreaStats | null {
  const idx: number[] = []

  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (box) {
        const [lon, lat] = centre(g, r, c)
        if (lon < box.w || lon > box.e || lat < box.s || lat > box.n) continue
      }
      idx.push(r * g.cols + c)
    }
  }
  if (!idx.length) return null

  const vegPctByYear: Record<number, number> = {}
  for (const y of g.years) {
    const grid = g.ndvi[String(y)]
    if (!grid) continue
    let seen = 0
    let veg = 0
    for (const i of idx) {
      const v = grid[i]
      if (v === null || v === undefined) continue
      seen++
      if (v / 100 >= 0.3) veg++
    }
    // Below a quarter coverage the number would be noise, so it is withheld
    // rather than shown with a caveat nobody will read.
    if (seen >= idx.length * 0.25) vegPctByYear[y] = (veg / seen) * 100
  }

  let lstSum = 0
  let lstN = 0
  let popSum = 0
  let popN = 0
  for (const i of idx) {
    const l = g.lst[i]
    if (l !== null && l !== undefined) {
      lstSum += l / 10
      lstN++
    }
    const p = g.pop[i]
    if (p !== null && p !== undefined) {
      popSum += p / 10
      popN++
    }
  }

  const cellHa = (g.cellM * g.cellM) / 10_000
  return {
    cells: idx.length,
    areaKm2: (idx.length * g.cellM * g.cellM) / 1e6,
    vegPctByYear,
    meanLstC: lstN ? lstSum / lstN : null,
    // people/ha over the cells, scaled to their combined area.
    people: popN ? Math.round((popSum / popN) * idx.length * cellHa) : null,
  }
}
