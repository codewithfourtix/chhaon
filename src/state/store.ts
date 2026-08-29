import { create } from 'zustand'
import type { RegionId, ViewId } from '../data/types'
import { DEFAULT_COST_PKR } from '../data/cost'

type Theme = 'light' | 'dark'
export type BasemapMode = 'map' | 'satellite'
export type LandUse = 'roadside' | 'park' | 'canal' | 'vacant'
export interface Box { w: number; s: number; e: number; n: number }

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
  /** Drawn sub-area, in WGS84. null means the whole region. */
  area: Box | null
  drawing: boolean
  costPkr: number
  costOpen: boolean
  airOpen: boolean
  dataLoading: boolean
  dataError: string | null
  /** Bumped to re-focus the camera on the selected site. */
  focusTick: number

  enterWorkspace: () => void
  showMethodology: () => void
  setView: (v: ViewId) => void
  setRegion: (r: RegionId) => void
  setYear: (y: number) => void
  selectSite: (id: string | null) => void
  toggleTheme: () => void
  setBasemap: (b: BasemapMode) => void
  toggleList: () => void
  setArea: (b: Box | null) => void
  setDrawing: (d: boolean) => void
  setCostPkr: (v: number) => void
  toggleCost: () => void
  toggleAir: () => void
  setFilters: (f: Partial<Filters>) => void
  clearFilters: () => void
  setDataLoading: (loading: boolean, error: string | null) => void
  focusSelected: () => void
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
  area: null,
  drawing: false,
  costPkr: DEFAULT_COST_PKR,
  costOpen: false,
  airOpen: false,
  dataLoading: true,
  dataError: null,
  focusTick: 0,

  enterWorkspace: () => set({ stage: 'workspace' }),
  showMethodology: () => set({ stage: 'methodology' }),
  setView: (view) => set({ view, selectedSiteId: null }),
  // A drawn area belongs to the region it was drawn over.
  setRegion: (region) =>
    set({ region, selectedSiteId: null, filters: NO_FILTERS, area: null, drawing: false }),
  setYear: (year) => set({ year }),
  selectSite: (selectedSiteId) => set({ selectedSiteId }),
  setBasemap: (basemap) => set({ basemap }),
  toggleList: () => set((s) => ({ listOpen: !s.listOpen })),
  setArea: (area) => set({ area, drawing: false }),
  setDrawing: (drawing) => set({ drawing }),
  setCostPkr: (costPkr) => set({ costPkr }),
  // The three tools are mutually exclusive: two panels stacked in the same
  // corner would cover each other.
  toggleCost: () => set((s) => ({ costOpen: !s.costOpen, airOpen: false })),
  toggleAir: () => set((s) => ({ airOpen: !s.airOpen, costOpen: false })),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f }, selectedSiteId: null })),
  clearFilters: () => set({ filters: NO_FILTERS, selectedSiteId: null }),
  setDataLoading: (dataLoading, dataError) => set({ dataLoading, dataError }),
  focusSelected: () => set((s) => ({ focusTick: s.focusTick + 1 })),
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
