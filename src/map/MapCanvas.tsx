import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, AttributionControl, type MapGeoJSONFeature } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { buildBasemapStyle, LIGHT_TOKENS, DARK_TOKENS, FIRST_LABEL_LAYER } from './basemapStyle'
import { LAHORE_BOUNDS, REGIONS } from '../data/regions'
import { useRegionData } from '../data/useRegionData'
import { useApp } from '../state/store'

/**
 * Rendering is MapLibre-native, not deck.gl.
 *
 * deck.gl 9.3's MapboxOverlay reads `map.transform`, which MapLibre 5+ no
 * longer exposes publicly, so it throws on every rendered frame. Native layers
 * are better here anyway: they live inside the style, so `beforeId` puts place
 * labels above the data for free.
 */

const CELLS = 'cells'
const SITES = 'sites'
const DATA_LAYERS = ['cells-shade', 'cells-fill', 'sites-circles'] as const

const HEAT_LIGHT = ['#E4E9ED', '#E9C88E', '#DC9A5A', '#C56836', '#9C3324', '#5C1015']
const HEAT_DARK = ['#2C3540', '#5E4340', '#96452F', '#C46628', '#E8983A', '#FFD166']
const CANOPY_LIGHT = ['#E6EBE7', '#C3D6C4', '#97BC9C', '#6BA077', '#3E8459', '#0F7A48']
const CANOPY_DARK = ['#14251C', '#1C3A2A', '#26523A', '#32704C', '#3FB871', '#7FE0A5']

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Discrete buckets, matching the six stops the legend shows. */
function stepColor(prop: unknown, breaks: number[], ramp: string[]) {
  const expr: unknown[] = ['step', prop, ramp[0]]
  breaks.forEach((b, i) => expr.push(b, ramp[i + 1]))
  return expr
}

const evenBreaks = (lo: number, hi: number) =>
  [1, 2, 3, 4, 5].map((i) => lo + ((hi - lo) * i) / 6)

export function MapCanvas() {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  // Readiness is held in a ref so it flips synchronously — effects in the same
  // commit still see a stale state value, which would let the layer effect call
  // addSource mid-setStyle and make MapLibre throw. The state mirror below is
  // what actually re-triggers the effect once the new style has landed.
  const styleReadyRef = useRef(false)
  const [styleLive, setStyleLive] = useState(false)

  const view = useApp((s) => s.view)
  const region = useApp((s) => s.region)
  const year = useApp((s) => s.year)
  const theme = useApp((s) => s.theme)
  const basemap = useApp((s) => s.basemap)
  const selectedSiteId = useApp((s) => s.selectedSiteId)
  const selectSite = useApp((s) => s.selectSite)
  const setLoading = useApp((s) => s.setDataLoading)

  const dark = theme === 'dark'
  const { grid, cells, sites, loading, error } = useRegionData(region)

  useEffect(() => {
    setLoading(loading, error)
  }, [loading, error, setLoading])

  // Created exactly once. The basemap is interactive before any data arrives.
  useEffect(() => {
    if (!container.current || map.current) return

    const m = new MapLibreMap({
      container: container.current,
      style: buildBasemapStyle(LIGHT_TOKENS, 'map'),
      center: REGIONS[0].centre,
      zoom: REGIONS[0].zoom,
      maxBounds: LAHORE_BOUNDS,
      minZoom: 10.5,
      maxZoom: 16,
      attributionControl: false,
      dragRotate: false,
    })
    m.addControl(new AttributionControl({ compact: false }), 'bottom-right')

    // `style.load` fires once per style. Do NOT use isStyleLoaded() — that
    // reports *tile* loading, so it flaps false while tiles stream in and never
    // recovers, silently freezing every later layer update.
    const onStyleLoad = () => {
      styleReadyRef.current = true
      setStyleLive(true)
    }
    m.on('style.load', onStyleLoad)

    map.current = m
    if (import.meta.env.DEV) (window as unknown as { __map?: MapLibreMap }).__map = m
    return () => {
      m.off('style.load', onStyleLoad)
      m.remove()
      map.current = null
    }
  }, [])

  // Theme and basemap mode both restyle in place, wiping layers; the layer
  // effect re-adds them once style.load reports ready.
  useEffect(() => {
    if (!map.current) return
    styleReadyRef.current = false
    setStyleLive(false)
    map.current.setStyle(
      buildBasemapStyle(dark ? DARK_TOKENS : LIGHT_TOKENS, basemap), { diff: false })
  }, [dark, basemap])

  // Region change flies. The flight is what tells the eye where it went.
  useEffect(() => {
    const r = REGIONS.find((x) => x.id === region)
    if (!r || !map.current) return
    if (reducedMotion()) map.current.jumpTo({ center: r.centre, zoom: r.zoom })
    else map.current.flyTo({ center: r.centre, zoom: r.zoom, curve: 1.42, speed: 0.9 })
  }, [region])

  // Sources and layers.
  useEffect(() => {
    const m = map.current
    if (!m || !styleReadyRef.current || !grid || !cells || !sites) return

    for (const id of DATA_LAYERS) if (m.getLayer(id)) m.removeLayer(id)
    for (const src of [CELLS, SITES]) if (m.getSource(src)) m.removeSource(src)
    m.addSource(CELLS, { type: 'geojson', data: cells })
    m.addSource(SITES, { type: 'geojson', data: sites })

    const satellite = basemap === 'satellite'
    const dur = reducedMotion() ? 0 : 900
    const latest = grid.years[grid.years.length - 1]
    const yearKey = String(year !== null && grid.years.includes(year) ? year : latest)
    const ndviProp = ['get', `n${yearKey}`]

    if (view === 'canopy') {
      const ramp = dark ? CANOPY_DARK : CANOPY_LIGHT
      const veg = ['>=', ndviProp, 0.30] as never

      // The signature: shade cast beside the canopy, offset in screen pixels.
      // Which cells qualify is decided by that year's measured NDVI, so
      // scrubbing back genuinely retreats the shade — nothing is faked.
      m.addLayer({
        id: 'cells-shade',
        type: 'fill',
        source: CELLS,
        filter: veg,
        paint: {
          'fill-color': dark ? '#000000' : '#0A0A0A',
          'fill-opacity': dark ? 0.55 : 0.22,
          'fill-translate': [6, 5],
          'fill-opacity-transition': { duration: dur, delay: 0 },
        },
      }, FIRST_LABEL_LAYER)

      m.addLayer({
        id: 'cells-fill',
        type: 'fill',
        source: CELLS,
        filter: ['has', `n${yearKey}`] as never,
        paint: {
          'fill-color': stepColor(ndviProp, [0.10, 0.20, 0.30, 0.42, 0.55], ramp) as never,
          'fill-opacity': satellite ? 0.88 : 0.78,
          'fill-opacity-transition': { duration: dur, delay: 0 },
        },
      }, FIRST_LABEL_LAYER)
    } else if (view === 'priority') {
      m.addLayer({
        id: 'sites-circles',
        type: 'circle',
        source: SITES,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            11, 4, 14, 9, 16, 16] as never,
          'circle-color': stepColor(['get', 'score'],
            evenBreaks(0.25, 0.95), dark ? HEAT_DARK : HEAT_LIGHT) as never,
          'circle-opacity': satellite ? 0.95 : 0.88,
          // Selection is a ring plus a lift, never a fill change.
          'circle-stroke-color': dark ? '#3FB871' : '#0F7A48',
          'circle-stroke-width': 0,
        },
      }, FIRST_LABEL_LAYER)
    } else {
      const heat = view === 'heat'
      const prop = ['get', heat ? 'lst' : 'pop']
      const lo = heat ? grid.baselineC - 1 : 0
      const hi = heat ? grid.baselineC + 12 : 400

      m.addLayer({
        id: 'cells-fill',
        type: 'fill',
        source: CELLS,
        filter: ['has', heat ? 'lst' : 'pop'] as never,
        paint: {
          'fill-color': heat
            ? (stepColor(prop, evenBreaks(lo, hi), dark ? HEAT_DARK : HEAT_LIGHT) as never)
            : (dark ? '#FAFAFA' : '#0A0A0A'),
          // Population uses ink at varying opacity, never its own hue — a third
          // colour scale would turn the map to mud.
          'fill-opacity': heat
            ? ((satellite ? 0.88 : 0.78) as never)
            : (['interpolate', ['linear'], prop, 0, 0.05, hi, 0.85] as never),
          'fill-opacity-transition': { duration: dur, delay: 0 },
        },
      }, FIRST_LABEL_LAYER)
    }
  }, [view, grid, cells, sites, dark, year, styleLive, basemap])

  // Selection ring — a paint update, never a layer rebuild.
  useEffect(() => {
    const m = map.current
    if (!m || !styleReadyRef.current || !m.getLayer('sites-circles')) return
    m.setPaintProperty('sites-circles', 'circle-stroke-width', [
      'case', ['==', ['get', 'id'], selectedSiteId ?? ' '], 2.5, 0,
    ])
  }, [selectedSiteId, styleLive, view])

  // Click picking, with a forgiving box so small marks stay hittable.
  useEffect(() => {
    const m = map.current
    if (!m) return

    const onClick = (e: { point: { x: number; y: number } }) => {
      if (!m.getLayer('sites-circles')) return
      const P = 8
      const hits = m.queryRenderedFeatures(
        [[e.point.x - P, e.point.y - P], [e.point.x + P, e.point.y + P]],
        { layers: ['sites-circles'] }
      ) as MapGeoJSONFeature[]
      selectSite((hits[0]?.properties?.id as string) ?? null)
    }
    const enter = () => { m.getCanvas().style.cursor = 'pointer' }
    const leave = () => { m.getCanvas().style.cursor = '' }

    m.on('click', onClick)
    m.on('mouseenter', 'sites-circles', enter)
    m.on('mouseleave', 'sites-circles', leave)
    return () => {
      m.off('click', onClick)
      m.off('mouseenter', 'sites-circles', enter)
      m.off('mouseleave', 'sites-circles', leave)
    }
  }, [selectSite])

  return (
    <div
      ref={container}
      className="map-canvas"
      role="application"
      aria-label={`Map of ${REGIONS.find((r) => r.id === region)?.name}, showing ${view}`}
    />
  )
}
