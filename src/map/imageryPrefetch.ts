import type { Map as MapLibreMap } from 'maplibre-gl'

/**
 * Warm the browser's cache with the photographs the scrubber is likely to ask for.
 *
 * Why: Esri's Wayback archive is slow. Measured over Lahore, a tile takes a median
 * 1.65 s and up to 9.4 s, and a laptop screen needs about 40 of them — so clicking
 * a year took 11.4 s before the photograph was fully drawn. The live basemap is
 * fast only because it is CDN-cached; the archive is not.
 *
 * The tiles are served with `Cache-Control: max-age=86400` and open CORS, so a tile
 * fetched once is served from the browser's own cache the next time MapLibre asks
 * for it. This fetches the tiles for the *current view* of the other periods'
 * photographs in the background, nearest period first — the one an arrow key or
 * the next click is most likely to land on — so by the time you move, it is local.
 *
 * Deliberately restrained:
 *  - only the tiles actually on screen, at the zoom MapLibre would request;
 *  - each distinct photograph once, since several years often share one capture;
 *  - a few requests at a time, at low priority, after the map has settled;
 *  - restarted whenever the view moves, abandoning what is no longer on screen;
 *  - **skipped entirely on Save-Data or a 2G/3G connection**, where ~4 MB of
 *    speculative photographs would cost more than the waiting it saves.
 */

const CONCURRENCY = 6

/** Tile x/y for a lon/lat at an integer zoom, in the Web Mercator scheme. */
function tileXY(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const r = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
  return [Math.max(0, Math.min(n - 1, x)), Math.max(0, Math.min(n - 1, y))]
}

/**
 * Tile coordinates covering the current view, at the zoom a 256 px raster source
 * requests: MapLibre works in 512 px tiles, so a 256 px source is one level deeper
 * than the map's own zoom, and raster sources round rather than floor it.
 */
export function visibleTiles(m: MapLibreMap, maxzoom = 19): [number, number, number][] {
  const z = Math.max(0, Math.min(maxzoom, Math.round(m.getZoom() + 1)))
  const b = m.getBounds()
  const [x0, y0] = tileXY(b.getWest(), b.getNorth(), z)
  const [x1, y1] = tileXY(b.getEast(), b.getSouth(), z)
  const out: [number, number, number][] = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, y, x])
  return out
}

/** A slow connection, or one that has asked us not to spend its data. */
export function shouldSkipPrefetch(): boolean {
  const c = (navigator as unknown as {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  if (!c) return false
  if (c.saveData) return true
  return ['slow-2g', '2g', '3g'].includes(c.effectiveType ?? '')
}

/**
 * Fetch every tile of each template for the current view, in order, a few at a
 * time. Resolves when done or aborted; failures are ignored — this is only ever
 * an optimisation, and the real request will simply go to the network instead.
 */
export async function prefetchTiles(
  templates: string[],
  tiles: [number, number, number][],
  signal: AbortSignal
): Promise<number> {
  const urls: string[] = []
  const seen = new Set<string>()
  for (const t of templates) {
    for (const [z, y, x] of tiles) {
      const u = t.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x))
      if (!seen.has(u)) {
        seen.add(u)
        urls.push(u)
      }
    }
  }

  let next = 0
  let done = 0
  const worker = async () => {
    while (next < urls.length && !signal.aborted) {
      const u = urls[next++]
      try {
        // `priority: 'low'` keeps these behind the tiles the user is looking at.
        await fetch(u, { mode: 'cors', signal, priority: 'low' } as RequestInit)
        done++
      } catch {
        if (signal.aborted) return
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return done
}
