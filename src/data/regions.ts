export type ViewId = 'canopy' | 'heat' | 'people' | 'priority'
export type RegionId = 'model-town' | 'gulberg' | 'dha'

export interface Region {
  id: RegionId
  name: string
  centre: [number, number]
  zoom: number
}

export const REGIONS: Region[] = [
  { id: 'model-town', name: 'Model Town', centre: [74.3239, 31.4805], zoom: 13.4 },
  { id: 'gulberg', name: 'Gulberg', centre: [74.3450, 31.5100], zoom: 13.4 },
  { id: 'dha', name: 'DHA', centre: [74.4114, 31.4697], zoom: 12.9 },
]

/** Lahore plus a margin — the user can never scroll off into empty grey. */
export const LAHORE_BOUNDS: [[number, number], [number, number]] = [
  [74.15, 31.34],
  [74.60, 31.66],
]

export const VIEWS: { id: ViewId; name: string; blurb: string }[] = [
  { id: 'canopy', name: 'Canopy', blurb: 'Green cover, and where it went' },
  { id: 'heat', name: 'Heat', blurb: 'Land surface temperature' },
  { id: 'people', name: 'People', blurb: 'Population density' },
  { id: 'priority', name: 'Priority', blurb: 'Ranked planting sites' },
]

/** Years we hold imagery for. Gaps are real and the scrubber shows them. */
export const YEARS = [2016, 2017, 2019, 2020, 2021, 2022, 2023, 2024, 2025] as const

/** Native resolution per view, stated on the thermal scale. */
export const RESOLUTION: Record<ViewId, string> = {
  canopy: '10 m / px',
  heat: '100 m / px',
  people: '100 m / px',
  priority: '10 m / px',
}

export const UNIT: Record<ViewId, string> = {
  canopy: 'NDVI',
  heat: '°C surface',
  people: 'people / ha',
  priority: 'score',
}
