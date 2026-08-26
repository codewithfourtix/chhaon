import type { RegionId, ViewId } from './types'

export type { RegionId, ViewId }

/**
 * The region list is static because the rail needs it before any data loads.
 * Everything else — the years, the scenes, the baselines — comes from
 * public/data/meta.json, which the pipeline writes.
 */
export const REGIONS: { id: RegionId; name: string; centre: [number, number]; zoom: number }[] = [
  { id: 'model-town', name: 'Model Town', centre: [74.3239, 31.4805], zoom: 13.4 },
  { id: 'gulberg', name: 'Gulberg', centre: [74.3520, 31.5150], zoom: 13.4 },
  { id: 'dha', name: 'DHA', centre: [74.4150, 31.4725], zoom: 12.9 },
  { id: 'johar-town', name: 'Johar Town', centre: [74.2775, 31.4740], zoom: 13.2 },
  { id: 'iqbal-town', name: 'Iqbal Town', centre: [74.2925, 31.5190], zoom: 13.2 },
]

/** Lahore plus a margin — the user can never scroll off into empty grey. */
export const LAHORE_BOUNDS: [[number, number], [number, number]] = [
  [74.14, 31.34],
  [74.62, 31.66],
]

export const VIEWS: { id: ViewId; name: string; blurb: string }[] = [
  { id: 'canopy', name: 'Canopy', blurb: 'Green cover, and where it went' },
  { id: 'heat', name: 'Heat', blurb: 'Land surface temperature' },
  { id: 'people', name: 'People', blurb: 'Population density' },
  { id: 'priority', name: 'Priority', blurb: 'Ranked planting sites' },
]

export const UNIT: Record<ViewId, string> = {
  canopy: 'NDVI',
  heat: '°C surface',
  people: 'people / ha',
  priority: 'score',
}

/** Which measurement each view is really showing, stated on the legend. */
export const SOURCE_RES: Record<ViewId, string> = {
  canopy: '10 m / px',
  heat: '100 m / px',
  people: '100 m / px',
  priority: '60 m / cell',
}

export const LANDUSE_NAME: Record<number, string> = {
  0: 'none',
  1: 'roadside',
  2: 'vacant',
  3: 'canal',
  4: 'park',
}
