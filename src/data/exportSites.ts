import type { Feature, Point } from 'geojson'
import type { SiteProps } from './types'

/**
 * A planner's first question after "where?" is "can I have that as a file?".
 * CSV because that is what opens on their machine, with every figure the site
 * plate shows plus the coordinates, so nothing has to be re-derived.
 */

const HEADERS = [
  'rank', 'latitude', 'longitude', 'score',
  'surface_temp_c', 'baseline_c', 'heat_above_baseline_c',
  'ndvi', 'people_served', 'land_use', 'cell_area_m2',
  'species_common', 'species_botanical', 'species_reason',
  'term_heat', 'term_canopy', 'term_people',
]

const cell = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function sitesToCsv(features: Feature<Point, SiteProps>[]): string {
  const rows = features.map((f) => {
    const p = f.properties
    const [lon, lat] = f.geometry.coordinates
    return [
      p.rank ?? '', lat.toFixed(5), lon.toFixed(5), p.score.toFixed(3),
      p.lstC.toFixed(1), p.baselineC.toFixed(1), (p.lstC - p.baselineC).toFixed(1),
      p.ndvi.toFixed(3), p.peopleServed, p.landuse, p.areaM2,
      p.species.common, p.species.botanical, p.species.because,
      p.terms.heat.toFixed(3), p.terms.canopy.toFixed(3), p.terms.people.toFixed(3),
    ].map(cell).join(',')
  })
  return [HEADERS.join(','), ...rows].join('\n')
}

export function downloadSites(features: Feature<Point, SiteProps>[], region: string) {
  const blob = new Blob([sitesToCsv(features)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chhaon-${region}-sites.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the download has actually started.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
