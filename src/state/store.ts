import { create } from 'zustand'
import type { RegionId, ViewId } from '../data/types'

type Theme = 'light' | 'dark'
export type BasemapMode = 'map' | 'satellite'

interface AppState {
  stage: 'overture' | 'workspace' | 'methodology'
  view: ViewId
  region: RegionId
  /** null until the pipeline's year list has loaded. */
  year: number | null
  selectedSiteId: string | null
  theme: Theme
  basemap: BasemapMode
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
  setDataLoading: (loading: boolean, error: string | null) => void
}

export const useApp = create<AppState>((set) => ({
  stage: 'overture',
  view: 'priority',
  region: 'model-town',
  year: null,
  selectedSiteId: null,
  theme: 'light',
  basemap: 'map',
  dataLoading: true,
  dataError: null,

  enterWorkspace: () => set({ stage: 'workspace' }),
  showMethodology: () => set({ stage: 'methodology' }),
  setView: (view) => set({ view, selectedSiteId: null }),
  setRegion: (region) => set({ region, selectedSiteId: null }),
  setYear: (year) => set({ year }),
  selectSite: (selectedSiteId) => set({ selectedSiteId }),
  setBasemap: (basemap) => set({ basemap }),
  setDataLoading: (dataLoading, dataError) => set({ dataLoading, dataError }),
  toggleTheme: () =>
    set((s) => {
      const theme: Theme = s.theme === 'light' ? 'dark' : 'light'
      document.documentElement.dataset.theme = theme
      return { theme }
    }),
}))
