import type { StyleSpecification } from 'maplibre-gl'

/**
 * Chhaon basemap — a substrate, not a subject.
 *
 * Near-monochrome survey sheet: paper land, paper water, hairline roads,
 * place labels only. Green is deliberately absent, including from parks —
 * green is reserved for measured canopy. See .claude/skills/map-ui/SKILL.md.
 *
 * Tiles: OpenFreeMap (OpenMapTiles schema, no key, no signup).
 * Pre-demo this is replaced by a self-hosted Lahore PMTiles extract so the
 * map has zero third-party runtime requests.
 */

export interface BasemapTokens {
  plate0: string
  plate2: string
  hairline: string
  hairlineFirm: string
  ink0: string
  ink1: string
}

export const LIGHT_TOKENS: BasemapTokens = {
  plate0: '#EDE7DA',
  plate2: '#E2DACA',
  hairline: '#C9BFA9',
  hairlineFirm: '#A8997C',
  ink0: '#1F1B14',
  ink1: '#5A5142',
}

export const DARK_TOKENS: BasemapTokens = {
  plate0: '#16110E',
  plate2: '#292120',
  hairline: '#3A2F2B',
  hairlineFirm: '#574943',
  ink0: '#F5EFE8',
  ink1: '#B8AAA0',
}

/** First symbol layer id — deck.gl slots beneath this so labels stay on top. */
export const FIRST_LABEL_LAYER = 'place-city'

export function buildBasemapStyle(t: BasemapTokens): StyleSpecification {
  return {
    version: 8,
    // Self-hosted in public/fonts before demo; glyph endpoint stays remote in dev.
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution:
          '<a href="https://openfreemap.org">OpenFreeMap</a> &middot; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': t.plate0 } },

      // Water is a cooler shade of the same paper. Never blue.
      {
        id: 'water',
        type: 'fill',
        source: 'omt',
        'source-layer': 'water',
        paint: { 'fill-color': t.plate2 },
      },

      // Parks are texture, not information. Deliberately not green.
      {
        id: 'landuse-park',
        type: 'fill',
        source: 'omt',
        'source-layer': 'park',
        paint: { 'fill-color': t.ink0, 'fill-opacity': 0.04 },
      },
      {
        id: 'landuse-park-edge',
        type: 'line',
        source: 'omt',
        'source-layer': 'park',
        paint: { 'line-color': t.hairline, 'line-width': 1 },
      },

      // Buildings appear only when they can mean something. Texture, no stroke.
      {
        id: 'building',
        type: 'fill',
        source: 'omt',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-color': t.ink0,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 16, 0.06],
        },
      },

      // Roads: hairlines. No casings, no colour coding.
      {
        id: 'road-minor',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['!in', 'class', 'motorway', 'trunk', 'primary'],
        minzoom: 12,
        paint: {
          'line-color': t.hairline,
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
          'line-color': t.hairlineFirm,
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
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 15, 12],
          'text-letter-spacing': 0.02,
          'text-max-width': 8,
          'text-padding': 6,
        },
        paint: {
          'text-color': t.ink1,
          'text-halo-color': t.plate0,
          'text-halo-width': 1.2,
        },
      },
    ],
  }
}
