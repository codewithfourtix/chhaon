import { REGIONS, type RegionId } from './regions'

/**
 * PLACEHOLDER DATA — not real analysis.
 *
 * These sites are deterministically generated so the interface can be built and
 * reviewed before the Earth Engine pipeline runs. Every one of them is replaced
 * by real output from the NDVI / LST / WorldPop / OSM pipeline.
 *
 * Nothing from this file may reach a screenshot, the demo, or the submission.
 */

export interface Site {
  id: string
  region: RegionId
  lon: number
  lat: number
  /** 0..1 combined priority score */
  score: number
  /** Surface temperature at the site, degrees C */
  lstC: number
  /** Neighbourhood shaded baseline, degrees C */
  baselineC: number
  /** People within 400 m */
  peopleServed: number
  /** Plantable area, square metres */
  areaM2: number
  landuse: 'roadside' | 'park' | 'canal' | 'vacant' | 'median'
  species: { common: string; botanical: string; because: string }
}

const SPECIES = {
  roadside: { common: 'Neem', botanical: 'Azadirachta indica', because: 'Narrow strip, high pollution load, low water once established' },
  median: { common: 'Amaltas', botanical: 'Cassia fistula', because: 'Compacted soil, restricted root volume, tolerates road salt and dust' },
  park: { common: 'Pipal', botanical: 'Ficus religiosa', because: 'Open ground with clearance from buildings and pipes' },
  canal: { common: 'Arjun', botanical: 'Terminalia arjuna', because: 'Low-lying and periodically waterlogged' },
  vacant: { common: 'Jamun', botanical: 'Syzygium cumini', because: 'Open plot, general-purpose dense shade, supports birds' },
} as const

const LANDUSES = ['roadside', 'park', 'canal', 'vacant', 'median'] as const

/** Deterministic pseudo-random so the placeholder set never shifts between runs. */
function rand(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export const PLACEHOLDER_SITES: Site[] = REGIONS.flatMap((region, ri) =>
  Array.from({ length: 22 }, (_, i) => {
    const s = ri * 100 + i
    const landuse = LANDUSES[Math.floor(rand(s + 4) * LANDUSES.length)]
    const baselineC = 34.2 + rand(s + 5) * 1.4
    return {
      id: `${region.id}-${i}`,
      region: region.id,
      lon: region.centre[0] + (rand(s) - 0.5) * 0.055,
      lat: region.centre[1] + (rand(s + 1) - 0.5) * 0.04,
      score: 0.32 + rand(s + 2) * 0.66,
      lstC: baselineC + 2.1 + rand(s + 3) * 6.4,
      baselineC,
      peopleServed: Math.round(400 + rand(s + 6) * 5200),
      areaM2: Math.round(180 + rand(s + 7) * 3400),
      landuse,
      species: SPECIES[landuse],
    }
  })
).sort((a, b) => b.score - a.score)
