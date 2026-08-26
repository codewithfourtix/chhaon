# Chhaon (چھاؤں)

Urdu for shade. Chhaon maps where Lahore lost its green cover, measures what that
loss cost in degrees, and ranks where to plant trees back — and which species to
plant at each site.

Built for **Smart City Hackathon Lahore 2026**, Theme Two: City Intelligence.

---

## Status

The interface is built and running against **placeholder data**. The Earth Engine
pipeline has not been run yet, so every site, temperature and score currently on
screen is synthetic — see `src/data/placeholderSites.ts`. Nothing from that file
may reach a screenshot, the demo, or the submission.

**Working now**
- Custom survey-sheet basemap (MapLibre, OpenFreeMap vector tiles)
- Four data views — canopy, heat, people, priority — with matching legends
- Instrument rail with a live readout of what is on screen
- Site plate: heat cost, people served, open score breakdown, species match
- Year scrubber with real coverage gaps marked
- The signature: canopy casts shade, and shade retreats as you scrub back
- Full light and dark themes, both first-class

**Not built yet**
- The Earth Engine / NDVI / LST / WorldPop / OSM pipeline
- Methodology screen
- Self-hosted fonts and a Lahore PMTiles extract (needed for a zero-third-party demo)

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build
node scripts/shots.mjs shots   # screenshots of every surface (dev server must be running)
```

## Stack

MapLibre GL JS renders everything natively — basemap and data layers alike.
There is no deck.gl: version 9.3's `MapboxOverlay` reads `map.transform`, which
MapLibre 5+ no longer exposes, so it throws on every frame. At a few hundred
features native `circle` layers are also better, because they live inside the
style and so place labels sit above the data for free.

React + TypeScript + Vite, Zustand for state, PMTiles for the tiled layers to
come. Deploys static to Vercel with no backend, so nothing can time out on stage.

## Project skills

`.claude/skills/` holds three skills written for this repo. Load them before
touching the relevant code:

| Skill | Load before |
|---|---|
| `chhaon-design-system` | any user-facing UI change |
| `map-ui` | any map code |
| `map-performance` | adding data to the map, or when it feels heavy |

`chhaon-design-system` is the locked visual direction and **overrides
`frontend-design` wherever the two disagree**. The palette's contrast ratios and
the thermal ramp's monotonicity are verified, not assumed — re-verify if you
change a colour.

## Docs

- `docs/SCREENS.md` — the six surfaces and the single job each one does

## Data sources

Copernicus and Google Earth Engine (imagery, NDVI, land surface temperature),
OpenStreetMap (plantable land), WorldPop (population), OpenFreeMap (basemap
tiles). All free and public.

## Honest limits

Stated here because they belong in the product too, not just the README:

- We say **green cover**, not tree canopy — Sentinel-2 is 10 m/px and cannot
  resolve individual trees.
- We say **surface temperature**, not temperature — land surface temperature is
  ~100 m/px and is not air temperature.
- Species matching is a best-effort read of site conditions, not a horticulture
  guarantee. A real deployment confirms with the Parks & Horticulture Authority
  or a nursery.
