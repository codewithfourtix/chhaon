import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, AttributionControl } from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { ScatterplotLayer } from '@deck.gl/layers'
import 'maplibre-gl/dist/maplibre-gl.css'

import { buildBasemapStyle, LIGHT_TOKENS, DARK_TOKENS, FIRST_LABEL_LAYER } from './basemapStyle'
import { PLACEHOLDER_SITES, type Site } from '../data/placeholderSites'
import { LAHORE_BOUNDS, REGIONS, YEARS } from '../data/regions'
import { useApp } from '../state/store'

type RGBA = [number, number, number, number]

const hex = (h: string, a = 255): RGBA => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
  a,
]

const RAMP_LIGHT = ['#CFD9D7', '#DCC79A', '#D69A5C', '#C26A38', '#9E3626', '#5F1218']
const RAMP_DARK = ['#35404A', '#6B4A46', '#9E4A32', '#C86A2A', '#E89A3C', '#FFD166']

/** t in 0..1 to one of six discrete ramp stops — the legend shows buckets, so the map does too. */
const rampColor = (t: number, dark: boolean, alpha = 210): RGBA => {
  const ramp = dark ? RAMP_DARK : RAMP_LIGHT
  const i = Math.min(5, Math.max(0, Math.floor(t * 6)))
  return hex(ramp[i], alpha)
}

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function MapCanvas() {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const overlay = useRef<MapboxOverlay | null>(null)
  // Interleaved layers need the style present before beforeId can resolve.
  const [styleReady, setStyleReady] = useState(false)

  const view = useApp((s) => s.view)
  const region = useApp((s) => s.region)
  const year = useApp((s) => s.year)
  const theme = useApp((s) => s.theme)
  const selectedSiteId = useApp((s) => s.selectedSiteId)
  const selectSite = useApp((s) => s.selectSite)

  const dark = theme === 'dark'

  // Stable reference — never build layer data inline in render.
  const sites = useMemo(
    () => PLACEHOLDER_SITES.filter((s) => s.region === region),
    [region]
  )

  /** How much canopy survives in the chosen year. Drives the retreating shade. */
  const canopyFactor = useMemo(() => {
    const span = YEARS[YEARS.length - 1] - YEARS[0]
    return 1 - ((year - YEARS[0]) / span) * 0.45
  }, [year])

  // Map is created exactly once.
  useEffect(() => {
    if (!container.current || map.current) return

    const m = new MapLibreMap({
      container: container.current,
      style: buildBasemapStyle(dark ? DARK_TOKENS : LIGHT_TOKENS),
      center: REGIONS[0].centre,
      zoom: REGIONS[0].zoom,
      maxBounds: LAHORE_BOUNDS,
      minZoom: 10.5,
      maxZoom: 16,
      attributionControl: false,
      dragRotate: false,
    })
    m.addControl(new AttributionControl({ compact: false }), 'bottom-right')

    // Interleaved so beforeId works and place labels stay above the data.
    const o = new MapboxOverlay({
      interleaved: false,
      layers: [],
      // One top-level handler: deck resolves the pick, so a miss means bare map.
      onClick: (info) => selectSite((info.object as Site | undefined)?.id ?? null),
    })
    m.addControl(o)

    const onStyle = () => setStyleReady(m.isStyleLoaded() === true)
    m.on('load', onStyle)
    m.on('styledata', onStyle)

    map.current = m
    overlay.current = o
    return () => {
      m.off('load', onStyle)
      m.off('styledata', onStyle)
      m.remove()
      map.current = null
      overlay.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Theme change restyles the basemap in place; the camera is untouched.
  useEffect(() => {
    if (!map.current) return
    setStyleReady(false)
    map.current.setStyle(buildBasemapStyle(dark ? DARK_TOKENS : LIGHT_TOKENS), {
      diff: false,
    })
  }, [dark])

  // Region change flies. Never jumps — the flight is what tells the eye where it went.
  useEffect(() => {
    const r = REGIONS.find((x) => x.id === region)
    if (!r || !map.current) return
    if (prefersReducedMotion()) {
      map.current.jumpTo({ center: r.centre, zoom: r.zoom })
    } else {
      map.current.flyTo({ center: r.centre, zoom: r.zoom, curve: 1.42, speed: 0.9 })
    }
  }, [region])

  // Layers
  useEffect(() => {
    if (!overlay.current || !styleReady) return

    const inkShade = dark ? hex('#000000', 150) : hex('#1F1B14', 90)
    const canopy = hex(dark ? '#5FBF7E' : '#2E8B57', 225)

    const common = {
      pickable: true,
      radiusUnits: 'meters' as const,
      radiusMinPixels: 4,
      radiusMaxPixels: 44,
      getPosition: (d: Site) => [d.lon, d.lat] as [number, number],
      beforeId: FIRST_LABEL_LAYER,
      transitions: {
        getRadius: { duration: prefersReducedMotion() ? 0 : 900 },
        getPosition: { duration: prefersReducedMotion() ? 0 : 900 },
        getFillColor: { duration: prefersReducedMotion() ? 0 : 420 },
      },
    }

    const layers = []

    if (view === 'canopy') {
      // The signature: shade cast beside the canopy mass, retreating as years pass.
      layers.push(
        new ScatterplotLayer<Site>({
          ...common,
          id: 'shade',
          data: sites,
          pickable: false,
          getPosition: (d) => [d.lon + 0.00042, d.lat - 0.00034],
          getRadius: (d) => Math.sqrt(d.areaM2) * 1.5 * canopyFactor,
          getFillColor: inkShade,
          updateTriggers: { getRadius: canopyFactor },
        }),
        new ScatterplotLayer<Site>({
          ...common,
          id: 'canopy',
          data: sites,
          getRadius: (d) => Math.sqrt(d.areaM2) * 1.4 * canopyFactor,
          getFillColor: canopy,
          updateTriggers: { getRadius: canopyFactor },
        })
      )
    } else {
      const value = (d: Site) =>
        view === 'heat'
          ? (d.lstC - 34) / 10
          : view === 'people'
            ? d.peopleServed / 5600
            : d.score

      layers.push(
        new ScatterplotLayer<Site>({
          ...common,
          id: view,
          data: sites,
          getRadius: (d) => Math.sqrt(d.areaM2) * 1.6,
          getFillColor: (d) =>
            view === 'people'
              ? hex(dark ? '#F5EFE8' : '#1F1B14', Math.round(40 + value(d) * 170))
              : rampColor(value(d), dark),
          getLineColor: hex(dark ? '#4FA96E' : '#1D5C3A'),
          getLineWidth: (d) => (d.id === selectedSiteId ? 2.5 : 0),
          lineWidthUnits: 'pixels',
          stroked: true,
          updateTriggers: {
            getFillColor: [view, dark],
            getLineWidth: selectedSiteId,
          },
        })
      )
    }

    overlay.current.setProps({ layers, pickingRadius: 8 })
  }, [view, sites, dark, selectedSiteId, canopyFactor, styleReady])

  return (
    <div
      ref={container}
      className="map-canvas"
      role="application"
      aria-label={`Map of ${REGIONS.find((r) => r.id === region)?.name}, showing ${view}`}
    />
  )
}
