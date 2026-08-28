import type { Feature, Point } from 'geojson'
import type { SiteProps } from './types'

/**
 * A planner's first question after "where?" is "can I have that as a file?".
 * CSV because that is what opens on their machine, with every figure the site
 * plate shows plus the coordinates, so nothing has to be re-derived.
 */

const HEADERS = [
  'rank', 'latitude', 'longitude', 'score',
  'est_co2_kg_per_year', 'est_pm25_g_per_year', 'mature_crown_m',
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
      p.species.co2KgPerYear, p.species.pm25GPerYear, p.species.crownM,
      p.lstC.toFixed(1), p.baselineC.toFixed(1), (p.lstC - p.baselineC).toFixed(1),
      p.ndvi.toFixed(3), p.peopleServed, p.landuse, p.areaM2,
      p.species.common, p.species.botanical, p.species.because,
      p.terms.heat.toFixed(3), p.terms.canopy.toFixed(3), p.terms.people.toFixed(3),
    ].map(cell).join(',')
  })
  return [HEADERS.join(','), ...rows].join('\n')
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the download has actually started.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * GeoJSON, so a department's own GIS team can open the ranking in QGIS or
 * ArcGIS directly. CSV is what a spreadsheet wants; this is what a GIS wants,
 * and respecting that they already have a workflow matters more than any
 * feature we could add to ours.
 */
export function downloadGeoJson(features: Feature<Point, SiteProps>[], region: string) {
  const fc = {
    type: 'FeatureCollection',
    name: `chhaon-${region}-sites`,
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3/CRS84' } },
    features: features.map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        ...f.properties,
        heatAboveBaselineC: Number((f.properties.lstC - f.properties.baselineC).toFixed(1)),
        speciesCommon: f.properties.species.common,
        speciesBotanical: f.properties.species.botanical,
        co2KgPerYear: f.properties.species.co2KgPerYear,
        pm25GPerYear: f.properties.species.pm25GPerYear,
      },
    })),
  }
  save(new Blob([JSON.stringify(fc, null, 1)], { type: 'application/geo+json' }),
    `chhaon-${region}-sites.geojson`)
}

export function downloadSites(features: Feature<Point, SiteProps>[], region: string) {
  const blob = new Blob([sitesToCsv(features)], { type: 'text/csv;charset=utf-8' })
  save(blob, `chhaon-${region}-sites.csv`)
}
