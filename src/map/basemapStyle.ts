import type { StyleSpecification } from 'maplibre-gl'

/**
 * Chhaon basemap — a substrate, not a subject.
 *
 * Two modes:
 *   'map'       a near-monochrome survey sheet. Green is deliberately absent,
 *               including from parks, because green is reserved for measured
 *               canopy.
 *   'satellite' Esri World Imagery, with a neutral scrim over it. Imagery is
 *               loud, saturated and high-contrast, so without the scrim the
 *               thermal ramp turns to mud. The scrim is what keeps the rule
 *               "the data carries the colour" true in satellite mode.
 *
 * See .claude/skills/map-ui/SKILL.md.
 */

export type BasemapMode = 'map' | 'satellite'

export interface BasemapTokens {
  plate0: string
  plate2: string
  hairline: string
  hairlineFirm: string
  ink0: string
  ink1: string
}

export const LIGHT_TOKENS: BasemapTokens = {
  plate0: '#FFFFFF',
  plate2: '#F2F2F2',
  hairline: '#E5E5E5',
  hairlineFirm: '#D1D1D1',
  ink0: '#0A0A0A',
  ink1: '#525252',
}

export const DARK_TOKENS: BasemapTokens = {
  plate0: '#0A0A0A',
  plate2: '#1C1C1C',
  hairline: '#262626',
  hairlineFirm: '#383838',
  ink0: '#FAFAFA',
  ink1: '#A3A3A3',
}

/** First symbol layer id — data layers slot beneath this so labels stay on top. */
export const FIRST_LABEL_LAYER = 'place-city'

const OSM_ATTRIB =
  '<a href="https://openfreemap.org">OpenFreeMap</a> &middot; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const ESRI_ATTRIB =
  'Imagery &copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics'

export function buildBasemapStyle(t: BasemapTokens, mode: BasemapMode = 'map'): StyleSpecification {
  const satellite = mode === 'satellite'

  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: OSM_ATTRIB,
      },
      ...(satellite
        ? {
            imagery: {
              type: 'raster' as const,
              tiles: [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              ],
              tileSize: 256,
              maxzoom: 19,
              attribution: ESRI_ATTRIB,
            },
          }
        : {}),
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': t.plate0 } },

      ...(satellite
        ? [
            { id: 'imagery', type: 'raster' as const, source: 'imagery',
              paint: { 'raster-saturation': -0.25, 'raster-contrast': -0.05 } },
            // The scrim. Without it the data ramp cannot win against the imagery.
            { id: 'scrim', type: 'background' as const,
              paint: { 'background-color': t.plate0, 'background-opacity': 0.42 } },
          ]
        : [
            // Water is a cooler shade of the same ground. Never blue.
            { id: 'water', type: 'fill' as const, source: 'omt', 'source-layer': 'water',
              paint: { 'fill-color': t.plate2 } },

            // Parks are texture, not information. Deliberately not green.
            { id: 'landuse-park', type: 'fill' as const, source: 'omt', 'source-layer': 'park',
              paint: { 'fill-color': t.ink0, 'fill-opacity': 0.04 } },
            { id: 'landuse-park-edge', type: 'line' as const, source: 'omt', 'source-layer': 'park',
              paint: { 'line-color': t.hairline, 'line-width': 1 } },

            { id: 'building', type: 'fill' as const, source: 'omt', 'source-layer': 'building',
              minzoom: 14,
              paint: {
                'fill-color': t.ink0,
                'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 16, 0.06] as never,
              } },
          ]),

      // Roads: hairlines in both modes, so the street grid always reads.
      {
        id: 'road-minor',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['!in', 'class', 'motorway', 'trunk', 'primary'],
        minzoom: 12,
        paint: {
          'line-color': satellite ? t.plate0 : t.hairline,
          'line-opacity': satellite ? 0.28 : 1,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 16, 1],
        },
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary'],
        paint: {
          'line-color': satellite ? t.plate0 : t.hairlineFirm,
          'line-opacity': satellite ? 0.45 : 1,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 16, 2.2],
        },
      },

      // Labels — place names only. No POIs, no icons, no shields.
      {
        id: FIRST_LABEL_LAYER,
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        filter: ['in', 'class', 'city', 'town', 'suburb', 'neighbourhood'],
        layout: {
          // Urdu needs the RTL text plugin to shape correctly; until that is
          // self-hosted, prefer the English name so labels are never mangled.
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 15, 12],
          'text-letter-spacing': 0.02,
          'text-max-width': 8,
          'text-padding': 6,
        },
        paint: {
          'text-color': t.ink1,
          'text-halo-color': t.plate0,
          'text-halo-width': satellite ? 1.8 : 1.2,
        },
      },
    ],
  }
}
