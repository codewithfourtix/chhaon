import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, AttributionControl, type MapGeoJSONFeature } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { buildBasemapStyle, LIGHT_TOKENS, DARK_TOKENS, FIRST_LABEL_LAYER } from './basemapStyle'
import { PLACEHOLDER_SITES, type Site } from '../data/placeholderSites'
import { LAHORE_BOUNDS, REGIONS, YEARS, type ViewId } from '../data/regions'
import { useApp } from '../state/store'

/**
 * Rendering is MapLibre-native, not deck.gl.
 *
 * deck.gl 9.3's MapboxOverlay reads `map.transform`, which MapLibre 5+ no
 * longer exposes publicly, so both interleaved and overlaid modes throw on
 * every frame. For a few hundred circles native layers are also simply better:
 * they live inside the style, so `beforeId` puts place labels above the data
 * for free, and there is one less version-compat surface before demo day.
 * Do not reintroduce deck.gl at this layer count.
 */

const SRC = 'sites'
const DATA_LAYERS = ['sites-shade', 'sites-canopy', 'sites-data'] as const

const RAMP_LIGHT = ['#CFD9D7', '#DCC79A', '#D69A5C', '#C26A38', '#9E3626', '#5F1218']
const RAMP_DARK = ['#35404A', '#6B4A46', '#9E4A32', '#C86A2A', '#E89A3C', '#FFD166']

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Discrete buckets, matching the six stops the thermal scale shows. */
function stepColor(prop: string, breaks: number[], dark: boolean) {
  const ramp = dark ? RAMP_DARK : RAMP_LIGHT
  const expr: unknown[] = ['step', ['get', prop], ramp[0]]
  breaks.forEach((b, i) => expr.push(b, ramp[i + 1]))
  return expr
}

const BREAKS: Partial<Record<ViewId, { prop: string; at: number[] }>> = {
  heat: { prop: 'lstC', at: [36.5, 38, 39.5, 41, 42.5] },
  priority: { prop: 'score', at: [0.45, 0.58, 0.7, 0.82, 0.92] },
}

export function MapCanvas() {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  // Readiness is held in a ref so it flips *synchronously*. A state flag alone
  // is not enough: effects in the same commit still see the previous value, so
  // the layer effect would run while setStyle is mid-flight and MapLibre would
  // throw "Style is not done loading". The epoch counter is what re-triggers
  // the layer effect once the new style has landed.
  const styleReadyRef = useRef(false)
  // Mirrored into state as well: the ref alone never re-triggers the effect, so
  // a view change landing between setStyle and style.load would bail out and
  // never re-run, stranding the map on the previous view.
  const [styleLive, setStyleLive] = useState(false)

  const view = useApp((s) => s.view)
  const region = useApp((s) => s.region)
  const year = useApp((s) => s.year)
  const theme = useApp((s) => s.theme)
  const selectedSiteId = useApp((s) => s.selectedSiteId)
  const basemap = useApp((s) => s.basemap)
  const selectSite = useApp((s) => s.selectSite)

  const dark = theme === 'dark'

  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: PLACEHOLDER_SITES.filter((s) => s.region === region).map((s: Site) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
        properties: {
          id: s.id,
          score: s.score,
          lstC: s.lstC,
          peopleServed: s.peopleServed,
          areaM2: s.areaM2,
        },
      })),
    }),
    [region]
  )

  /** How much canopy survives in the chosen year — drives the retreating shade. */
  const canopyFactor = useMemo(() => {
    const span = YEARS[YEARS.length - 1] - YEARS[0]
    return 1 - ((year - YEARS[0]) / span) * 0.45
  }, [year])

  // Created exactly once.
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

    // `style.load` fires once per style, on first load and after every setStyle.
    // Do NOT use isStyleLoaded() here — that reports *tile* loading, so it flaps
    // to false while tiles stream in and never recovers, which silently freezes
    // every later layer update.
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

  // Theme restyles in place. Data layers are re-added by the layer effect once
  // `styledata` reports the new style ready.
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

  // Source + layers.
  useEffect(() => {
    const m = map.current
    if (!m || !styleReadyRef.current) return

    for (const id of DATA_LAYERS) if (m.getLayer(id)) m.removeLayer(id)
    if (m.getSource(SRC)) m.removeSource(SRC)
    m.addSource(SRC, { type: 'geojson', data: geojson })

    const dur = reducedMotion() ? 0 : 900
    const satellite = basemap === 'satellite'
    const radius = (k: number) => ['*', ['sqrt', ['get', 'areaM2']], k]

    if (view === 'canopy') {
      // The signature: shade cast beside the canopy mass, retreating with the years.
      // circle-translate offsets in screen pixels, so the cast stays consistent.
      m.addLayer(
        {
          id: 'sites-shade',
          type: 'circle',
          source: SRC,
          paint: {
            'circle-radius': radius(0.4 * canopyFactor) as never,
            'circle-color': dark ? '#000000' : '#1F1B14',
            'circle-opacity': dark ? 0.55 : 0.28,
            'circle-translate': [7, 6],
            'circle-blur': 0.35,
            'circle-radius-transition': { duration: dur, delay: 0 },
          },
        },
        FIRST_LABEL_LAYER
      )
      m.addLayer(
        {
          id: 'sites-canopy',
          type: 'circle',
          source: SRC,
          paint: {
            'circle-radius': radius(0.38 * canopyFactor) as never,
            'circle-color': dark ? '#5FBF7E' : '#2E8B57',
            'circle-opacity': 0.88,
            'circle-radius-transition': { duration: dur, delay: 0 },
          },
        },
        FIRST_LABEL_LAYER
      )
    } else {
      const b = BREAKS[view]
      // People: ink at varying opacity, never its own hue.
      const color = b ? stepColor(b.prop, b.at, dark) : dark ? '#F5EFE8' : '#1F1B14'

      m.addLayer(
        {
          id: 'sites-data',
          type: 'circle',
          source: SRC,
          paint: {
            'circle-radius': radius(0.42) as never,
            'circle-color': color as never,
            // Over imagery the data must sit harder, or the scrim plus the
            // photograph eats the ramp.
            'circle-opacity':
              view === 'people'
                ? (['interpolate', ['linear'], ['get', 'peopleServed'], 400, 0.18, 5600, 0.82] as never)
                : satellite ? 0.95 : 0.85,
            // Selection is a ring plus a lift, never a fill change.
            'circle-stroke-color': dark ? '#3FB871' : '#0F7A48',
            'circle-stroke-width': 0,
            'circle-stroke-opacity': 1,
          },
        },
        FIRST_LABEL_LAYER
      )
    }
  }, [view, geojson, dark, canopyFactor, styleLive, basemap])

  // Selection ring — a paint update, never a layer rebuild.
  useEffect(() => {
    const m = map.current
    if (!m || !styleReadyRef.current || !m.getLayer('sites-data')) return
    m.setPaintProperty('sites-data', 'circle-stroke-width', [
      'case',
      ['==', ['get', 'id'], selectedSiteId ?? ' '],
      2.5,
      0,
    ])
  }, [selectedSiteId, styleLive, view])

  // Click picking, with a forgiving box so small circles stay hittable.
  useEffect(() => {
    const m = map.current
    if (!m) return

    const onClick = (e: { point: { x: number; y: number } }) => {
      const P = 6
      const live = DATA_LAYERS.filter((id) => m.getLayer(id))
      if (!live.length) return
      const hits = m.queryRenderedFeatures(
        [
          [e.point.x - P, e.point.y - P],
          [e.point.x + P, e.point.y + P],
        ],
        { layers: live }
      ) as MapGeoJSONFeature[]
      selectSite((hits[0]?.properties?.id as string) ?? null)
    }

    const enter = () => {
      m.getCanvas().style.cursor = 'pointer'
    }
    const leave = () => {
      m.getCanvas().style.cursor = ''
    }

    m.on('click', onClick)
    for (const id of DATA_LAYERS) {
      m.on('mouseenter', id, enter)
      m.on('mouseleave', id, leave)
    }
    return () => {
      m.off('click', onClick)
      for (const id of DATA_LAYERS) {
        m.off('mouseenter', id, enter)
        m.off('mouseleave', id, leave)
      }
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
