import { create } from 'zustand'
import type { RegionId, ViewId } from '../data/regions'
import { YEARS } from '../data/regions'

type Theme = 'light' | 'dark'
export type BasemapMode = 'map' | 'satellite'

interface AppState {
  stage: 'overture' | 'workspace'
  view: ViewId
  region: RegionId
  year: number
  selectedSiteId: string | null
  theme: Theme
  basemap: BasemapMode
  railCollapsed: boolean

  enterWorkspace: () => void
  setView: (v: ViewId) => void
  setRegion: (r: RegionId) => void
  setYear: (y: number) => void
  selectSite: (id: string | null) => void
  toggleTheme: () => void
  setBasemap: (b: BasemapMode) => void
  toggleRail: () => void
}

export const useApp = create<AppState>((set) => ({
  stage: 'overture',
  view: 'priority',
  region: 'model-town',
  year: YEARS[YEARS.length - 1],
  selectedSiteId: null,
  theme: 'light',
  basemap: 'map',
  railCollapsed: false,

  enterWorkspace: () => set({ stage: 'workspace' }),
  setView: (view) => set({ view, selectedSiteId: null }),
  setRegion: (region) => set({ region, selectedSiteId: null }),
  setYear: (year) => set({ year }),
  selectSite: (selectedSiteId) => set({ selectedSiteId }),
  setBasemap: (basemap) => set({ basemap }),
  toggleTheme: () =>
    set((s) => {
      const theme: Theme = s.theme === 'light' ? 'dark' : 'light'
      document.documentElement.dataset.theme = theme
      return { theme }
    }),
  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
}))
