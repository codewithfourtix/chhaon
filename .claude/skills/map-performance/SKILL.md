---
name: map-performance
description: Keeping the Chhaon map at 60fps with real geospatial data on static hosting — PMTiles, tiling, geometry simplification, deck.gl update discipline, and the demo-day checklist. Load before adding data to the map or when the map feels heavy.
---

# Map Performance

Chhaon ships as a **static site on Vercel with no backend**. Every byte is
precomputed, committed, and served as a file. This is both the fastest path to
build and the only demo-safe one: nothing can time out on stage.

That constraint is the whole design. Work within it.

---

## The rule

**Never load a whole GeoJSON of anything you plan to zoom into.** A raw
neighbourhood canopy layer is tens of megabytes; parsing it blocks the main
thread for seconds and the map dies before it renders.

The threshold is roughly:

- **under ~2 MB and fewer than ~5,000 features** — plain GeoJSON is fine, load
  it directly
- **anything larger** — it becomes PMTiles

Measure, do not guess. `ls -la` the file before you decide.

## PMTiles

PMTiles is a single-file tile archive read over HTTP range requests. One file on
Vercel, no tile server, no CDN configuration.

```
tippecanoe -o canopy.pmtiles \
  --maximum-zoom=15 --minimum-zoom=10 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --layer=canopy canopy.geojson
```

- Cap `--maximum-zoom` at the zoom where the source data stops being meaningful.
  Tiling 100m data to z18 quadruples file size and renders a claim the data
  cannot support.
- `--drop-densest-as-needed` is what keeps tiles under the size limit in dense
  areas. Without it, tiles silently get dropped instead of thinned.
- Register the protocol once at app start, before any map mounts:
  `maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile)`

Commit the `.pmtiles` files. They are build outputs, but they are also the
product, and a repo that clones and runs is worth more than a clean one.

## Geometry, before it ever reaches the browser

Do this in the Python pipeline, not at runtime:

- **Simplify** with `mapshaper -simplify 10% keep-shapes` or GeoPandas
  `.simplify(tolerance)`. Pick tolerance from the source resolution — simplifying
  10m data below ~5m of tolerance discards nothing a viewer can see.
- **Round coordinates** to 5 decimal places. That is roughly 1m precision, and
  it cuts file size by a third for free. Six or more decimals is storing noise.
- **Drop every property the UI does not read.** Satellite-derived files carry
  dozens of unused bands and ids. Keep only what the site plate displays.
- **Quantise scores** to the buckets the legend actually shows. Storing
  `0.7834129` when the legend has six stops is wasted bytes.

## deck.gl update discipline

deck.gl re-uploads a layer's data to the GPU whenever it thinks the data
changed. Most stutter in a React map comes from this, not from the data size.

- Layer `data` must be a **stable reference**. Never build an array inline in
  render. Memoise it, or hold it in the store.
- Use `updateTriggers` for accessors that depend on state (the active year, the
  active view). This recomputes only the changed attribute rather than the
  whole buffer.
- Prefer changing `visible` and `opacity` over unmounting and remounting layers.
  A cross-fade between two mounted layers is cheap; a remount is not.
- For the year scrubber, precompute **all** years into one buffer with a year
  attribute, and filter on the GPU with `DataFilterExtension`. Do not swap
  datasets per year — that reuploads on every drag frame.

## React discipline

- The map instance lives in a ref and is created **once**. It is never
  recreated on a state change.
- Zustand selectors are narrow. A component that only needs `activeYear`
  subscribes to `activeYear` alone, or every scrubber drag re-renders the rail.
- The scrubber is throttled to animation frames while dragging, and commits its
  final value on release.
- Nothing that touches the map is in React state if it can live in the map.
  Camera position especially — mirroring it into React state re-renders the tree
  at 60fps for no reason.

## Loading order

The map must be interactive before the data arrives:

1. Basemap style and MapLibre — first paint, fully pannable
2. The active layer for the current region and year
3. Everything else, in the background, lowest priority

Never `await` all layers and then render. That trades a fast, usable map for a
slow, blank one.

## Budgets — check these before demo day

- First interactive map: **under 2 s** on a normal connection
- Layer switch: **under 400 ms** to fully cross-faded
- Scrubber drag: **60 fps sustained**, no dropped frames
- Total initial transfer: **under 3 MB**
- No single main-thread task over **50 ms** after first paint

Verify with `chrome-devtools-mcp`: record a performance trace, drag the
scrubber, switch every layer, and read the actual frame timings. Do not ship on
"it felt smooth on my machine" — the demo laptop will not be your machine.

## Demo-day hardening

- Throttle to Fast 3G in DevTools and confirm the map still opens. Venue wifi is
  worse than you think.
- Every asset is same-origin and committed. **Zero third-party runtime
  requests** — no CDN fonts pulled at load, no tile server, no API call. Self-host
  the four Google Fonts as woff2 in `public/fonts` and preload them.
- Test with the network fully disabled after first load. What breaks is what
  will break on stage.
