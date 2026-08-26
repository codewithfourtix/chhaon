import { useEffect } from 'react'
import { REGIONS, VIEWS } from '../data/regions'
import { useRegionData } from '../data/useRegionData'
import { useApp } from './store'
import type { RegionId, ViewId } from '../data/types'

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

/**
 * Keyboard control for the whole workspace.
 *
 * Also the reason the ranked list can be driven without a mouse: arrow keys
 * step through the ranking and the map follows, which is the accessible
 * equivalent of clicking dots on a canvas.
 */
export function useAppShortcuts() {
  const s = useApp()
  const { grid, sites } = useRegionData(s.region)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key

      // 1–4 select a view.
      const vi = Number(k)
      if (vi >= 1 && vi <= VIEWS.length) {
        s.setView(VIEWS[vi - 1].id as ViewId)
        e.preventDefault()
        return
      }

      // Q / W / E select a region.
      const ri = ['q', 'w', 'e'].indexOf(k.toLowerCase())
      if (ri >= 0 && ri < REGIONS.length) {
        s.setRegion(REGIONS[ri].id as RegionId)
        e.preventDefault()
        return
      }

      const years = grid?.years ?? []
      const feats = sites?.features ?? []

      switch (k) {
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!years.length) return
          const i = Math.max(0, years.indexOf(s.year ?? years[years.length - 1]))
          const next = k === 'ArrowLeft' ? i - 1 : i + 1
          if (next >= 0 && next < years.length) s.setYear(years[next])
          e.preventDefault()
          break
        }
        case 'ArrowUp':
        case 'ArrowDown': {
          if (s.view !== 'priority' || !feats.length) return
          const i = feats.findIndex((f) => f.properties.id === s.selectedSiteId)
          const next = k === 'ArrowUp' ? i - 1 : i + 1
          if (i === -1) s.selectSite(feats[0].properties.id)
          else if (next >= 0 && next < feats.length) s.selectSite(feats[next].properties.id)
          e.preventDefault()
          break
        }
        case 'l':
        case 'L':
          s.toggleList()
          e.preventDefault()
          break
        case 'd':
        case 'D':
          s.toggleTheme()
          e.preventDefault()
          break
        case 'b':
        case 'B':
          s.setBasemap(s.basemap === 'map' ? 'satellite' : 'map')
          e.preventDefault()
          break
        case 'm':
        case 'M':
          if (s.stage === 'methodology') s.enterWorkspace()
          else s.showMethodology()
          e.preventDefault()
          break
        case 'Escape':
          if (s.selectedSiteId) s.selectSite(null)
          else if (s.stage === 'methodology') s.enterWorkspace()
          break
        default:
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s, grid, sites])
}

/**
 * State in the URL, so a finding can be sent to someone. Kept in the hash so it
 * costs no server config on a static host.
 */
export function useUrlState() {
  const s = useApp()

  // Read once on mount.
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1))
    const patch: Record<string, unknown> = {}
    const region = h.get('r')
    const view = h.get('v')
    const year = Number(h.get('y'))
    const site = h.get('s')
    const theme = h.get('t')
    const base = h.get('b')

    if (REGIONS.some((x) => x.id === region)) patch.region = region
    if (VIEWS.some((x) => x.id === view)) patch.view = view
    if (Number.isFinite(year) && year > 1900) patch.year = year
    if (site) patch.selectedSiteId = site
    if (theme === 'light' || theme === 'dark') {
      patch.theme = theme
      document.documentElement.dataset.theme = theme
    }
    if (base === 'map' || base === 'satellite') patch.basemap = base
    if (Object.keys(patch).length) {
      patch.stage = 'workspace'
      s.hydrate(patch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Write on change, without adding history entries.
  useEffect(() => {
    if (s.stage === 'overture') return
    const h = new URLSearchParams()
    h.set('r', s.region)
    h.set('v', s.view)
    if (s.year) h.set('y', String(s.year))
    if (s.selectedSiteId) h.set('s', s.selectedSiteId)
    h.set('t', s.theme)
    h.set('b', s.basemap)
    window.history.replaceState(null, '', `#${h.toString()}`)
  }, [s.stage, s.region, s.view, s.year, s.selectedSiteId, s.theme, s.basemap])
}
