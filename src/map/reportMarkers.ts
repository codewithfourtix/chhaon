import type { Map as MapLibreMap } from 'maplibre-gl'
import { REPORT_KINDS, type ReportKind } from '../data/reports'

/**
 * Icons for citizen reports.
 *
 * Reports are drawn as **diamonds**, never circles. Ranked planting sites are
 * solid circles and selection is a hairline ring around one, so a hollow circle
 * for a report would read as a selected site — the two carry opposite meanings
 * (an observation of what happened versus a recommendation of what to do) and
 * must not be confusable at a glance.
 *
 * Colour follows the design system rather than inventing a palette:
 *   - loss (felled, fire) takes the hot end of the thermal ramp, because that is
 *     what losing canopy does to the ground temperature
 *   - dieback sits mid-ramp: failing, not yet gone
 *   - a new planting is the one case where canopy green is legitimate — it is
 *     literally new canopy
 *   - anything else is ink, which is what the system uses for "not on a scale"
 *
 * Generated rather than shipped as files so both themes get their own set with
 * no assets to keep in sync. `setStyle` wipes registered images along with
 * layers, so this is called again from the layer effect on every restyle.
 */

const KIND_COLOUR: Record<ReportKind, { light: string; dark: string }> = {
  felled: { light: '#5C1015', dark: '#FFD166' },
  fire: { light: '#9C3324', dark: '#E8983A' },
  dieback: { light: '#C56836', dark: '#C46628' },
  planted: { light: '#0F7A48', dark: '#3FB871' },
  other: { light: '#525252', dark: '#A3A3A3' },
}

export const reportIconId = (kind: ReportKind) => `report-${kind}`
/** The id for a report that has been placed but not yet saved. */
export const PENDING_ICON = 'report-pending'

const SIZE = 13
const SCALE = 2

function diamond(fill: string, ring: string, dashed = false): ImageData | null {
  const px = SIZE * SCALE
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const c = px / 2
  const r = c - 2 * SCALE
  ctx.beginPath()
  ctx.moveTo(c, c - r)
  ctx.lineTo(c + r, c)
  ctx.lineTo(c, c + r)
  ctx.lineTo(c - r, c)
  ctx.closePath()

  if (dashed) {
    // The unsaved pin is an outline only: it is a position the user is still
    // choosing, and a solid mark would read as a committed report.
    ctx.setLineDash([3 * SCALE, 2 * SCALE])
  } else {
    ctx.fillStyle = fill
    ctx.fill()
  }
  // The ring is the ground colour, which is what lets a dark mark read against
  // dark satellite imagery without adding a glow.
  ctx.strokeStyle = ring
  ctx.lineWidth = 1.6 * SCALE
  ctx.stroke()

  return ctx.getImageData(0, 0, px, px)
}

/** Register every report icon on the current style. Safe to call repeatedly. */
export function addReportIcons(m: MapLibreMap, dark: boolean) {
  const ring = dark ? '#0A0A0A' : '#FFFFFF'
  for (const kind of REPORT_KINDS) {
    const id = reportIconId(kind)
    if (m.hasImage(id)) continue
    const data = diamond(KIND_COLOUR[kind][dark ? 'dark' : 'light'], ring)
    if (data) m.addImage(id, data, { pixelRatio: SCALE })
  }
  if (!m.hasImage(PENDING_ICON)) {
    const data = diamond('transparent', dark ? '#3FB871' : '#0F7A48', true)
    if (data) m.addImage(PENDING_ICON, data, { pixelRatio: SCALE })
  }
}

/* --------------------------------------------------------------------------
 * Detected loss
 * --------------------------------------------------------------------------
 *
 * A third shape, because there are now three kinds of mark on this map and each
 * one is a different kind of claim:
 *
 *   circle   a ranked planting site — what we recommend
 *   diamond  a citizen report — what a person saw
 *   triangle a detected loss — what the satellite measured changing
 *
 * Confusing a recommendation with an accusation would be the worst of the three
 * mistakes, so the shapes are deliberately far apart rather than three sizes of
 * the same dot.
 */

export const EVENT_ICONS = { severe: 'loss-severe', notable: 'loss-notable' } as const

function triangle(fill: string, ring: string): ImageData | null {
  const px = SIZE * SCALE + 2 * SCALE
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const c = px / 2
  const r = c - 2 * SCALE
  // Point up: the universal "attend to this" mark, and it cannot be mistaken for
  // either a site circle or a report diamond at any size.
  ctx.beginPath()
  ctx.moveTo(c, c - r)
  ctx.lineTo(c + r * 0.92, c + r * 0.72)
  ctx.lineTo(c - r * 0.92, c + r * 0.72)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = ring
  ctx.lineWidth = 1.6 * SCALE
  ctx.stroke()

  return ctx.getImageData(0, 0, px, px)
}

export function addEventIcons(m: MapLibreMap, dark: boolean) {
  const ring = dark ? '#0A0A0A' : '#FFFFFF'
  // Hot end of the thermal ramp: losing canopy is a heat event, which keeps this
  // inside the existing palette rather than introducing an alert red.
  const colours = {
    severe: dark ? '#FFD166' : '#5C1015',
    notable: dark ? '#E8983A' : '#9C3324',
  }
  for (const key of ['severe', 'notable'] as const) {
    const id = EVENT_ICONS[key]
    if (m.hasImage(id)) continue
    const data = triangle(colours[key], ring)
    if (data) m.addImage(id, data, { pixelRatio: SCALE })
  }
}
