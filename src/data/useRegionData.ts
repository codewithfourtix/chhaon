import type { FeatureCollection, Point } from 'geojson'
import { useEffect, useState } from 'react'
import { loadGrid, loadMeta, loadSites } from './load'
import type { Meta, RegionGrid, RegionId, SiteProps } from './types'

export interface RegionData {
  meta: Meta | null
  grid: RegionGrid | null
  sites: FeatureCollection<Point, SiteProps> | null
  loading: boolean
  error: string | null
}

const EMPTY: RegionData = {
  meta: null, grid: null, sites: null, loading: true, error: null,
}

/**
 * Loads everything one region needs. The map stays interactive throughout —
 * the basemap never waits on this.
 */
export function useRegionData(region: RegionId): RegionData {
  const [state, setState] = useState<RegionData>(EMPTY)

  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))

    Promise.all([loadMeta(), loadGrid(region), loadSites(region)])
      .then(([meta, grid, sites]) => {
        if (!live) return
        setState({ meta, grid, sites, loading: false, error: null })
      })
      .catch((e: unknown) => {
        if (!live) return
        setState({
          ...EMPTY,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
        })
      })

    return () => {
      live = false
    }
  }, [region])

  return state
}
