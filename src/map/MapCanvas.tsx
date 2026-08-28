import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, AttributionControl, type MapGeoJSONFeature } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { buildBasemapStyle, LIGHT_TOKENS, DARK_TOKENS, FIRST_LABEL_LAYER } from './basemapStyle'
import { LAHORE_BOUNDS, REGIONS } from '../data/regions'
import { domainFor, domainForScores, rampBreaks } from '../data/load'
import { rasterizeGrid } from './rasterize'
import { RISK_COLOURS } from '../data/risk'
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

const FIELD = 'field'
const EDGE = 'field-edge-src'
const BOX = 'area-box'
const SITES = 'sites'
const DATA_LAYERS = ['field-raster', 'field-edge', 'sites-halo', 'sites-circles', 'sites-rank'] as const

const HEAT_LIGHT = ['#E4E9ED', '#E9C88E', '#DC9A5A', '#C56836', '#9C3324', '#5C1015']
const HEAT_DARK = ['#2C3540', '#5E4340', '#96452F', '#C46628', '#E8983A', '#FFD166']
const CANOPY_LIGHT = ['#E6EBE7', '#C3D6C4', '#97BC9C', '#6BA077', '#3E8459', '#0F7A48']
const CANOPY_DARK = ['#14251C', '#1C3A2A', '#26523A', '#32704C', '#3FB871', '#7FE0A5']
// Population stays achromatic — a third hue would turn the map to mud — but as
// a raster it needs real colours rather than an opacity trick.
const PEOPLE_LIGHT = ['#F2F2F2', '#D6D6D6', '#B0B0B0', '#828282', '#4F4F4F', '#1A1A1A']
const PEOPLE_DARK = ['#141414', '#2E2E2E', '#4E4E4E', '#7A7A7A', '#ADADAD', '#EDEDED']

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Discrete buckets for the ranked-site circles, matching the legend's stops. */
function stepColor(prop: unknown, breaks: number[], ramp: string[]) {
  const expr: unknown[] = ['step', prop, ramp[0]]
  breaks.forEach((b, i) => expr.push(b, ramp[i + 1]))
  return expr
}

export function MapCanvas() {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  // Readiness is held in a ref so it flips synchronously — effects in the same
  // commit still see a stale state value, which would let the layer effect call
  // addSource mid-setStyle and make MapLibre throw. The state mirror below is
  // what actually re-triggers the effect once the new style has landed.
  const styleReadyRef = useRef(false)
  // A monotonic counter, NOT a boolean. setStyle sets the flag false and
  // style.load sets it true; if React batches both into one render a boolean
  // goes true -> true, React sees no change, and the layer effect never re-runs
  // — which silently dropped every data layer when the basemap switched. A
  // counter always differs, so the effect always fires.
  const [styleEpoch, setStyleEpoch] = useState(0)

  const view = useApp((s) => s.view)
  const region = useApp((s) => s.region)
  const year = useApp((s) => s.year)
  const theme = useApp((s) => s.theme)
  const basemap = useApp((s) => s.basemap)
  const selectedSiteId = useApp((s) => s.selectedSiteId)
  const selectSite = useApp((s) => s.selectSite)
  const filters = useApp((s) => s.filters)
  const focusTick = useApp((s) => s.focusTick)
  const drawing = useApp((s) => s.drawing)
  const area = useApp((s) => s.area)
  const setArea = useApp((s) => s.setArea)
  const setLoading = useApp((s) => s.setDataLoading)

  const dark = theme === 'dark'
  const { grid, sites, loading, error } = useRegionData(region)

  useEffect(() => {
    setLoading(loading, error)
  }, [loading, error, setLoading])

  // Created exactly once. The basemap is interactive before any data arrives.
  useEffect(() => {
    if (!container.current || map.current) return

    const m = new MapLibreMap({
      container: container.current,
      // Mount-time values: this effect runs once, so the map is built with the
      // theme and basemap the app actually starts in rather than restyling.
      style: buildBasemapStyle(dark ? DARK_TOKENS : LIGHT_TOKENS, basemap),
      center: REGIONS[0].centre,
      zoom: REGIONS[0].zoom,
      maxBounds: LAHORE_BOUNDS,
      minZoom: 10.5,
      maxZoom: 16,
      attributionControl: false,
      dragRotate: false,
    })
    m.addControl(new AttributionControl({ compact: false }), 'bottom-right')

    // MapLibre reports an invalid paint expression here and then draws nothing.
    // Without this the layer simply appears missing, which cost real time once.
    m.on('error', (ev) => {
      console.error('[map]', (ev as unknown as { error?: Error }).error ?? ev)
    })

    // `style.load` fires once per style. Do NOT use isStyleLoaded() — that
    // reports *tile* loading, so it flaps false while tiles stream in and never
    // recovers, silently freezing every later layer update.
    const onStyleLoad = () => {
      styleReadyRef.current = true
      setStyleEpoch((n) => n + 1)
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
    if (!m || !styleReadyRef.current || !grid || !sites) return

    for (const id of DATA_LAYERS) if (m.getLayer(id)) m.removeLayer(id)
    for (const src of [FIELD, EDGE, SITES]) if (m.getSource(src)) m.removeSource(src)

    const satellite = basemap === 'satellite'

    // A quiet outline of the analysed area, so the field reads as a study region
    // rather than an image that happens to stop.
    const { tl, tr, bl, br } = grid.cornersWgs84
    m.addSource(EDGE, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [tl, tr, br, bl, tl] },
      },
    })
    m.addLayer({
      id: 'field-edge',
      type: 'line',
      source: EDGE,
      paint: {
        'line-color': dark ? '#FAFAFA' : '#0A0A0A',
        'line-opacity': satellite ? 0.28 : 0.18,
        'line-width': 1,
        'line-dasharray': [4, 3],
      },
    }, FIRST_LABEL_LAYER)

    if (view === 'priority') {
      const shown = {
        ...sites,
        features: sites.features.filter((f) => {
          const p = f.properties
          if (filters.landuse.length && !filters.landuse.includes(p.landuse as never)) return false
          if (filters.minPeople && p.peopleServed < filters.minPeople) return false
          if (filters.species && p.species.common !== filters.species) return false
          return true
        }),
      }
      m.addSource(SITES, { type: 'geojson', data: shown })

      // The ramp spans the scores that exist. A fixed 0.25-0.95 domain over
      // scores that run 0.66-0.80 put every site in two of six buckets, so the
      // top site and the fortieth came out the same colour.
      const [slo, shi] = domainForScores(sites.features.map((f) => f.properties.score))
      // Size by score. MapLibre requires the zoom expression at the TOP level of
      // a paint property — wrapping it in a multiply makes the whole property
      // invalid and the layer silently draws nothing, which is exactly what
      // happened here. So zoom is the outer interpolate and the score scaling
      // lives inside each stop.
      const byScore = (px: number) =>
        ['interpolate', ['linear'], ['get', 'score'], slo, px * 0.62, shi, px * 1.35]
      const radius = (a: number, b: number, c: number) =>
        ['interpolate', ['linear'], ['zoom'], 11, byScore(a), 14, byScore(b), 16, byScore(c)]

      // A soft halo so a dark pin still reads against dark imagery.
      m.addLayer({
        id: 'sites-halo',
        type: 'circle',
        source: SITES,
        paint: {
          'circle-radius': radius(7, 15, 24) as never,
          'circle-color': dark ? '#000000' : '#FFFFFF',
          'circle-opacity': satellite ? 0.34 : 0.22,
          'circle-blur': 0.6,
        },
      }, FIRST_LABEL_LAYER)

      m.addLayer({
        id: 'sites-circles',
        type: 'circle',
        source: SITES,
        paint: {
          // Rank is encoded twice — colour and size — so the order is readable
          // at a glance and still readable to anyone who cannot separate hues.
          'circle-radius': radius(5, 11, 18) as never,
          'circle-color': stepColor(['get', 'score'], rampBreaks(slo, shi),
            dark ? HEAT_DARK : HEAT_LIGHT) as never,
          'circle-opacity': satellite ? 0.96 : 0.92,
          'circle-stroke-color': dark ? '#3FB871' : '#0F7A48',
          'circle-stroke-width': 0,
        },
      }, FIRST_LABEL_LAYER)

      // Numbered ranks on the strongest sites: the map should say which one to
      // do first, not merely which ones qualify.
      m.addLayer({
        id: 'sites-rank',
        type: 'symbol',
        source: SITES,
        filter: ['<=', ['get', 'rank'], 12] as never,
        layout: {
          'text-field': ['to-string', ['get', 'rank']] as never,
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9, 14, 12] as never,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': dark ? '#0A0A0A' : '#FFFFFF',
          'text-halo-color': dark ? '#FFD166' : '#5C1015',
          'text-halo-width': 0.6,
        },
      }, FIRST_LABEL_LAYER)
      return
    }

    // Everything else is a measured field, so it is drawn as an interpolated
    // raster rather than one polygon per cell. See ./rasterize.ts.
    const canopy = view === 'canopy'
    const [lo, hi] = domainFor(grid, view, year)
    const risk = view === 'risk'
    const stops = canopy
      ? (dark ? CANOPY_DARK : CANOPY_LIGHT)
      : risk
        ? RISK_COLOURS[dark ? 'dark' : 'light']
        : view === 'people'
          ? (dark ? PEOPLE_DARK : PEOPLE_LIGHT)
          : (dark ? HEAT_DARK : HEAT_LIGHT)

    const raster = rasterizeGrid(grid, view, year, { stops, lo, hi, discrete: risk },
      canopy
        ? {
            // The signature: canopy casts shade, one cell down and to the right.
            shadeOffset: [1, 1],
            shadeRgb: dark ? [0, 0, 0] : [10, 10, 10],
            vegThreshold: 0.3,
          }
        : {})
    if (!raster) return

    m.addSource(FIELD, {
      type: 'image',
      url: raster.url,
      coordinates: raster.coordinates,
    })
    m.addLayer({
      id: 'field-raster',
      type: 'raster',
      source: FIELD,
      paint: {
        // Linear resampling is what turns 60 m cells into a continuous field
        // instead of a mosaic of squares.
        'raster-resampling': 'linear',
        'raster-opacity': satellite ? 0.62 : 0.78,
        'raster-fade-duration': reducedMotion() ? 0 : 300,
        'raster-contrast': satellite ? 0.06 : 0,
      },
    }, FIRST_LABEL_LAYER)
  }, [view, grid, sites, dark, year, styleEpoch, basemap, filters])

  // Selection ring — a paint update, never a layer rebuild.
  useEffect(() => {
    const m = map.current
    if (!m || !styleReadyRef.current || !m.getLayer('sites-circles')) return
    m.setPaintProperty('sites-circles', 'circle-stroke-width', [
      'case', ['==', ['get', 'id'], selectedSiteId ?? ' '], 2.5, 0,
    ])
  }, [selectedSiteId, styleEpoch, view])

  // Selecting a site flies to it and zooms to where you could actually see the
  // ground. The site plate opens on the left half, so the camera is offset to
  // keep the pin in the visible part of the map rather than under the panel.
  const SITE_ZOOM = 16
  useEffect(() => {
    const m = map.current
    if (!m || !selectedSiteId || !sites) return
    const f = sites.features.find((x) => x.properties.id === selectedSiteId)
    if (!f) return
    const [lon, lat] = f.geometry.coordinates

    const w = m.getContainer().clientWidth
    // Roughly the width the plate and the list take out of the map.
    const covered = Math.min(w * 0.55, 740)
    const offset: [number, number] = w > 900 ? [-covered / 2 + 40, 0] : [0, 0]

    if (reducedMotion()) {
      // jumpTo takes no offset, so pre-apply it to the centre.
      const c = m.unproject(m.project([lon, lat]).sub({ x: offset[0], y: offset[1] } as never))
      m.jumpTo({ center: c, zoom: Math.max(m.getZoom(), SITE_ZOOM) })
    } else {
      m.flyTo({
        center: [lon, lat],
        zoom: Math.max(m.getZoom(), SITE_ZOOM),
        offset,
        curve: 1.3,
        speed: 1.1,
      })
    }
  }, [selectedSiteId, sites, focusTick])

  // Drawing a sub-area. Dragging the map is disabled while armed, otherwise
  // the first drag pans instead of drawing and it feels broken.
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!drawing) {
      m.dragPan.enable()
      m.getCanvas().style.cursor = ''
      return
    }
    m.dragPan.disable()
    m.getCanvas().style.cursor = 'crosshair'

    let start: { lng: number; lat: number } | null = null

    const down = (e: { lngLat: { lng: number; lat: number } }) => {
      start = { ...e.lngLat }
    }
    const move = (e: { lngLat: { lng: number; lat: number } }) => {
      if (!start) return
      draw(start, e.lngLat)
    }
    const up = (e: { lngLat: { lng: number; lat: number } }) => {
      if (!start) return
      const b = {
        w: Math.min(start.lng, e.lngLat.lng),
        e: Math.max(start.lng, e.lngLat.lng),
        s: Math.min(start.lat, e.lngLat.lat),
        n: Math.max(start.lat, e.lngLat.lat),
      }
      start = null
      // A stray click is not a selection.
      if (b.e - b.w < 1e-4 || b.n - b.s < 1e-4) return
      setArea(b)
    }

    m.on('mousedown', down)
    m.on('mousemove', move)
    m.on('mouseup', up)
    return () => {
      m.off('mousedown', down)
      m.off('mousemove', move)
      m.off('mouseup', up)
      m.dragPan.enable()
      m.getCanvas().style.cursor = ''
    }
  }, [drawing, setArea])

  // Render the drawn area, live while dragging and persistent once set.
  useEffect(() => {
    const m = map.current
    if (!m || !styleReadyRef.current) return
    if (area) draw({ lng: area.w, lat: area.s }, { lng: area.e, lat: area.n })
    else clearBox()
  }, [area, styleEpoch])

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

  function clearBox() {
    const m = map.current
    if (!m || !m.getSource(BOX)) return
    if (m.getLayer('area-fill')) m.removeLayer('area-fill')
    if (m.getLayer('area-line')) m.removeLayer('area-line')
    m.removeSource(BOX)
  }

  function draw(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
    const m = map.current
    if (!m || !styleReadyRef.current) return
    const ring = [
      [a.lng, a.lat], [b.lng, a.lat], [b.lng, b.lat], [a.lng, b.lat], [a.lng, a.lat],
    ]
    const data = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates: [ring] },
    }
    const src = m.getSource(BOX) as { setData?: (d: unknown) => void } | undefined
    if (src?.setData) {
      src.setData(data)
      return
    }
    m.addSource(BOX, { type: 'geojson', data })
    m.addLayer({
      id: 'area-fill',
      type: 'fill',
      source: BOX,
      paint: { 'fill-color': dark ? '#3FB871' : '#0F7A48', 'fill-opacity': 0.12 },
    })
    m.addLayer({
      id: 'area-line',
      type: 'line',
      source: BOX,
      paint: {
        'line-color': dark ? '#3FB871' : '#0F7A48',
        'line-width': 1.5,
        'line-dasharray': [3, 2],
      },
    })
  }

  return (
    <div
      ref={container}
      className="map-canvas"
      role="application"
      aria-label={`Map of ${REGIONS.find((r) => r.id === region)?.name}, showing ${view}`}
    />
  )
}
