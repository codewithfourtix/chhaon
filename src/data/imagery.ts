import type { RegionId } from './types'

/**
 * Historical satellite imagery, matched to each year by its real capture date.
 *
 * Written by `pipeline/imagery.py`. The satellite basemap used to be Esri's single
 * current mosaic, so clicking 2017 on the scrubber changed the measured overlay and
 * left today's photograph underneath — which read as a control that did nothing.
 *
 * Esri's Wayback archive holds every past release of that imagery. But a release
 * date is not a capture date: the 2019-09-18 release shows Model Town as it was
 * photographed on 2017-02-10. So every period here is resolved to a capture by the
 * date the photograph was actually taken, and the UI states that date — never the
 * release date, and never the year the user clicked unless the photograph really is
 * from it.
 */

export interface Capture {
  /** ISO date the photograph was taken. */
  captured: string
  /** Sensor, e.g. GE01 (GeoEye-1), WV03 (WorldView-3). */
  source: string
  /** Ground resolution in metres. */
  resM: number
  /** Wayback release whose tiles carry this capture. */
  release: number
  releaseDate: string
  /** Of the points sampled across the region, how many show this date. */
  samples: number
  matching: number
  /** Other capture dates found in the same release's mosaic, if any. */
  otherDates: string[]
}

interface Pick {
  capture: string
  sameYear?: boolean
  samePeriod?: boolean
}

export interface ImageryDoc {
  generated: string
  source: string
  tileUrl: string
  regions: Partial<Record<RegionId, {
    captures: Capture[]
    byYear: Record<string, Pick>
    byMonth: Record<string, Pick>
  }>>
}

let memo: Promise<ImageryDoc | null> | null = null

// Resolves the first time anyone actually asks for the index. The map asks once
// the workspace has settled; the readout only listens, so it never pulls the file
// onto the startup path itself.
let requested: () => void = () => {}
const firstRequest = new Promise<void>((r) => {
  requested = r
})

/** The index, once the map has asked for it. Never triggers the fetch itself. */
export const whenImagery = (): Promise<ImageryDoc | null> =>
  firstRequest.then(() => memo ?? Promise.resolve(null))

/**
 * The imagery index. Absent before `pipeline/imagery.py` has run, in which case the
 * basemap stays the current live mosaic — the product's behaviour before this
 * existed, not a failure.
 */
export function loadImagery(): Promise<ImageryDoc | null> {
  if (memo) return memo
  queueMicrotask(requested)
  memo = fetch('data/imagery.json')
    .then(async (res) => {
      if (!res.ok) return null
      if (!(res.headers.get('content-type') ?? '').includes('json')) return null
      return (await res.json()) as ImageryDoc
    })
    .catch(() => null)
  return memo
}

export interface ImageryChoice {
  capture: Capture
  tiles: string
  /** True when the photograph was taken inside the period being viewed. */
  matchesPeriod: boolean
}

/**
 * The photograph to show under a period.
 *
 * `period` is '2019' on the yearly cadence or '2026-06' on the monthly one.
 */
export function imageryFor(
  doc: ImageryDoc | null,
  region: RegionId,
  period: string | null
): ImageryChoice | null {
  const r = doc?.regions[region]
  if (!doc || !r || !period) return null

  const monthly = period.includes('-')
  const pick = monthly ? r.byMonth[period] : r.byYear[period]
  if (!pick) return null

  const capture = r.captures.find((c) => c.captured === pick.capture)
  if (!capture) return null

  return {
    capture,
    tiles: doc.tileUrl.replace('{release}', String(capture.release)),
    matchesPeriod: monthly ? !!pick.samePeriod : !!pick.sameYear,
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '10 Feb 2017' — the form a person reads a capture date in. */
export function captureLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** GE01 -> GeoEye-1. Falls back to the raw code rather than guessing. */
export function sensorName(code: string): string {
  const known: Record<string, string> = {
    GE01: 'GeoEye-1',
    WV01: 'WorldView-1',
    WV02: 'WorldView-2',
    WV03: 'WorldView-3',
    WV03_VNIR: 'WorldView-3',
    WV04: 'WorldView-4',
    LG04: 'Legion-4',
    Pleiades: 'Pléiades',
  }
  return known[code] ?? code
}
