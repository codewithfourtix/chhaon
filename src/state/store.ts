import { create } from 'zustand'
import type { RegionId, ViewId } from '../data/types'

type Theme = 'light' | 'dark'
export type BasemapMode = 'map' | 'satellite'
export type LandUse = 'roadside' | 'park' | 'canal' | 'vacant'

export interface Filters {
  landuse: LandUse[]
  minPeople: number
  species: string | null
}

export const NO_FILTERS: Filters = { landuse: [], minPeople: 0, species: null }

export const hasFilters = (f: Filters) =>
  f.landuse.length > 0 || f.minPeople > 0 || f.species !== null

interface AppState {
  stage: 'overture' | 'workspace' | 'methodology'
  view: ViewId
  region: RegionId
  /** null until the pipeline's year list has loaded. */
  year: number | null
  selectedSiteId: string | null
  theme: Theme
  basemap: BasemapMode
  listOpen: boolean
  filters: Filters
  dataLoading: boolean
  dataError: string | null

  enterWorkspace: () => void
  showMethodology: () => void
  setView: (v: ViewId) => void
  setRegion: (r: RegionId) => void
  setYear: (y: number) => void
  selectSite: (id: string | null) => void
  toggleTheme: () => void
  setBasemap: (b: BasemapMode) => void
  toggleList: () => void
  setFilters: (f: Partial<Filters>) => void
  clearFilters: () => void
  setDataLoading: (loading: boolean, error: string | null) => void
  hydrate: (s: Partial<AppState>) => void
}

/** Dark is the default: this is a thermal instrument, and it reads better dark. */
const INITIAL_THEME: Theme = 'dark'
/** Satellite by default — the measured fields land on real ground, which is
 *  what makes them believable at first glance. */
const INITIAL_BASEMAP: BasemapMode = 'satellite'

export const useApp = create<AppState>((set) => ({
  stage: 'overture',
  view: 'priority',
  region: 'model-town',
  year: null,
  selectedSiteId: null,
  theme: INITIAL_THEME,
  basemap: INITIAL_BASEMAP,
  listOpen: true,
  filters: NO_FILTERS,
  dataLoading: true,
  dataError: null,

  enterWorkspace: () => set({ stage: 'workspace' }),
  showMethodology: () => set({ stage: 'methodology' }),
  setView: (view) => set({ view, selectedSiteId: null }),
  setRegion: (region) => set({ region, selectedSiteId: null, filters: NO_FILTERS }),
  setYear: (year) => set({ year }),
  selectSite: (selectedSiteId) => set({ selectedSiteId }),
  setBasemap: (basemap) => set({ basemap }),
  toggleList: () => set((s) => ({ listOpen: !s.listOpen })),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f }, selectedSiteId: null })),
  clearFilters: () => set({ filters: NO_FILTERS, selectedSiteId: null }),
  setDataLoading: (dataLoading, dataError) => set({ dataLoading, dataError }),
  hydrate: (patch) => set(patch as AppState),
  toggleTheme: () =>
    set((s) => {
      const theme: Theme = s.theme === 'light' ? 'dark' : 'light'
      document.documentElement.dataset.theme = theme
      return { theme }
    }),
}))

// Applied before first paint so the app never flashes light.
if (typeof document !== 'undefined') {
  document.documentElement.dataset.theme = INITIAL_THEME
}
