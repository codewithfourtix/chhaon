---
name: map-ui
description: How to build a map that reads as a professional city instrument rather than a student project — MapLibre + deck.gl craft, basemap styling, layer choreography, legends, selection, camera, and map-specific states. Load before touching any map code in this repo.
---

# Map UI

The stack is **MapLibre GL JS** (basemap, vector tiles, camera) with a
**deck.gl** overlay (data layers, GPU). No Mapbox token, no Leaflet, no
Kepler.gl. This is settled — do not reintroduce alternatives.

Read `chhaon-design-system` first. This file is how that system gets applied to
a map specifically.

---

## The one rule that decides everything

**The basemap is a substrate, not a subject.** Almost every amateur map fails
here: it uses a loud default basemap and then draws loud data on top, and the
two fight. Desaturate and quiet the basemap until it is nearly monochrome, then
let the data carry every bit of colour in the frame.

If you can read a road label as easily as you can read the heat layer, the
basemap is too loud.

## Basemap style

Build a custom MapLibre style JSON. Do not ship a stock `positron` or
`dark-matter` and call it done — a stock basemap is the single fastest way to
look generic.

- Land is `--plate-0`. Water is a slightly cooler, slightly darker shade of the
  same paper — never blue.
- Roads are `--hairline` hairlines. Motorways get `--hairline-firm` and one step
  more width. No casings, no colour coding.
- Buildings appear only above zoom 14, as a 6% ink fill with no stroke. They are
  texture, not information.
- Labels: `IBM Plex Sans` 500 at 11px, `--ink-1`, with a 1px `--plate-0` halo.
  Place names only. No POIs, no icons, no shields, ever.
- Park and green polygons are drawn but **not tinted green** — green is reserved
  for measured canopy. Parks get a 4% ink fill and a hairline edge.

The result should look like a survey sheet someone is about to draw on.

## Layer order (bottom to top, never rearranged)

1. Basemap land, water, roads
2. Buildings
3. The active data layer — exactly one
4. The shade layer (the signature)
5. Selected-site marker
6. Basemap labels — labels always sit **above** data so the map stays readable
7. Chrome (rail, scale, scrubber) in DOM, not in WebGL

Putting labels under data is the second most common amateur mistake. Use
MapLibre's `beforeId` with the first symbol layer to slot deck.gl beneath the
label layer.

## Switching views

Never hard-swap layers. Cross-fade opacity over `--dur-view` with
`--ease-instrument`, and hold both layers mounted for the duration. A hard swap
reads as a page reload; a cross-fade reads as an instrument changing mode.

The thermal scale on the right re-labels itself during the same transition and
keeps identical geometry, so nothing in the frame jumps.

## Camera

- Region changes use `flyTo` with `curve: 1.42`, `speed: 0.9`, and
  `easing` matched to `--ease-instrument`. Never `jumpTo` for a user-initiated
  move — the flight is what tells the eye where it went.
- Selecting a site does **not** recentre the map. Nothing is more disorienting
  than the ground moving when you click a thing. Instead, offset the camera only
  if the site plate would cover the selected site, and only by the minimum
  needed.
- `maxBounds` is set to Lahore plus a margin. The user can never scroll into
  empty grey ocean and lose the product.
- `minZoom` / `maxZoom` are set to the range where our data is actually
  meaningful. Do not let people zoom to z18 on 100m data — that visibly renders
  the claim false.

## Selection and hover

- Hover: cursor becomes `pointer`, the feature lifts by one elevation step, and
  a hairline ring appears. **No tooltip on hover.** Tooltips that chase the
  cursor are the fastest way to feel cheap.
- Click: opens the site plate, and the feature keeps a persistent `--canopy`
  ring. The ring, not a fill change — a fill change corrupts the data reading.
- Escape clears selection. Clicking the basemap clears selection.
- Hit areas are generous: use deck.gl's `pickingRadius: 8`. Precise clicking on
  small marks is a desktop-only luxury.

## Legend — the thermal scale

- Vertical, right edge, six discrete stops with hairline separators. Discrete
  beats a smooth gradient here: a planner reads a bucket, not a continuum.
- Label only the two ends plus the midpoint, in `data` mono, with the unit set
  once at the top in `label`.
- State the native resolution at the bottom of the scale in `unit` type — e.g.
  `100 m / px`. This single line does more for credibility than any amount of
  polish.
- The scale never disappears while a data layer is on. A map with colour and no
  key is a decoration.

## States the map must have

Amateur maps only have the happy state. Build all five:

- **First frame** — basemap interactive immediately, data still loading. Never
  block the map behind a spinner.
- **Loading data** — a 2px `--canopy` progress hairline along the top edge of
  the map. Nothing else. No skeleton over the map, no modal.
- **Empty** — a region with no qualifying sites says so in a small plate with
  the reason, not a shrug. "No sites above the score threshold in DHA for 2019."
- **Error** — states which layer failed and offers a retry, while leaving every
  other layer working. One dead layer must never take the map down.
- **Reduced motion** — cross-fades replace shade animation, camera cuts replace
  flights.

## Accessibility on a map

A canvas is invisible to a screen reader. This is not optional polish:

- The ranked site list exists as a real, keyboard-navigable DOM list — visually
  it can be inside the rail, but it is the accessible equivalent of the map.
  Arrow keys move through sites, Enter selects, and selection syncs both ways.
- The map container gets `role="application"` and an `aria-label` naming the
  region and active layer.
- Every colour claim is backed by a number in text somewhere. Colour is never
  the only carrier of meaning.
- Keyboard pan/zoom is left enabled — do not disable MapLibre's keyboard
  handlers to stop scroll-jacking.

## Things that instantly look amateur

- Default MapLibre popups. Build the site plate; never use `new Popup()`.
- The default `+ / −` zoom control and compass. Style your own, or omit.
- Attribution shoved into a corner at 8px. Set it properly in `--ink-2` at
  `unit` size — attribution is a licence obligation and a credibility signal.
- Rainbow / jet colour ramps.
- Markers as pins. Use circles or extruded polygons sized by data.
- A basemap in one visual language and data in another.
