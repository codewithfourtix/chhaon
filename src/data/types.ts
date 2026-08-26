export type ViewId = 'canopy' | 'heat' | 'people' | 'priority'
export type RegionId = 'model-town' | 'gulberg' | 'dha'

/** Quantised grids: null means no usable observation for that cell. */
export type QGrid = (number | null)[]

export interface RegionGrid {
  region: RegionId
  name: string
  bbox: [number, number, number, number]
  cornersWgs84: {
    tl: [number, number]
    tr: [number, number]
    bl: [number, number]
    br: [number, number]
  }
  cellM: number
  cols: number
  rows: number
  years: number[]
  /** NDVI x100, keyed by year */
  ndvi: Record<string, QGrid>
  /** Surface temperature in °C x10 */
  lst: QGrid
  /** People per hectare x10 */
  pop: QGrid
  /** 0 none, 1 roadside, 2 vacant, 3 canal, 4 park */
  landuse: number[]
  built: number[]
  baselineC: number
}

export interface SiteProps {
  id: string
  /** 1 = highest priority in this region. */
  rank?: number
  score: number
  lstC: number
  baselineC: number
  ndvi: number
  peopleServed: number
  areaM2: number
  landuse: string
  terms: { heat: number; canopy: number; people: number }
  species: { common: string; botanical: string; because: string }
}

export interface RegionMeta {
  name: string
  centre: [number, number]
  zoom: number
  years: number[]
  ndviScenes: Record<string, {
    id: string; date: string; cloud: number
    composited?: number; dates?: string[]
  }>
  lstScene: { id: string; datetime: string; cloud: number }
  baselineC: number
  siteCount: number
  /** Median surface-temperature gap between bare and well-vegetated ground. */
  heatGapC: number | null
  /** Correlation of NDVI against surface temperature across all cells. */
  ndviLstCorr: number | null
  /** Vegetated share of ground, per year. */
  vegPctByYear: Record<string, number>
}

export interface Meta {
  generated: string
  cellM: number
  weights: { heat: number; canopy: number; people: number }
  ndviWindow: [string, string]
  lstWindow: [string, string]
  ndviVegThreshold: number
  resolution: Record<string, string>
  regions: Record<RegionId, RegionMeta>
}
