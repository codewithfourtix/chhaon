# Chhaon (چھاؤں)

Urdu for shade. Chhaon measures where Lahore lost its green cover, prices that
loss in degrees of surface heat, and ranks where planting would do the most good
— and what species to plant at each site.

Built for **Smart City Hackathon Lahore 2026**, Theme Two: City Intelligence.
Five regions: Model Town, Gulberg, DHA, Johar Town and Iqbal Town.

---

## The data is real

Every number in the interface comes from measured satellite and open map data,
computed by `pipeline/` and committed as static files under `public/data/`.

| Layer | Source | Native resolution |
|---|---|---|
| Green cover (NDVI) | Sentinel-2 L2A via Element 84 Earth Search | 10 m |
| Surface temperature | Landsat 8/9 C2 L2 via Microsoft Planetary Computer | 100 m |
| Plantable land | OpenStreetMap via Overpass (ODbL) | vector |
| Population | WorldPop 2020 constrained | 100 m |
| Basemap | OpenFreeMap · imagery © Esri, Maxar | vector / raster |

No API key is needed for any of it. The app makes **zero** runtime API calls —
everything is precomputed, so nothing can time out during a demo.

## Honest limits

These are stated in the product too, on the Method screen — not buried here.

- We say **green cover**, not tree canopy. At 10 m/px a vegetated cell may be
  lawn, crop, scrub or canopy. We cannot count trees.
- We say **surface temperature**, not temperature. Land surface temperature runs
  much hotter than air, and Landsat passes over Lahore mid-morning, so these are
  morning surface temperatures rather than the afternoon peak.
- Analysis is on a **60 m grid**. A cell is a neighbourhood-scale statement, not
  a parcel-level one.
- Species matching is best-effort from site context, not a horticulture
  guarantee. Confirm with the Parks & Horticulture Authority or a nursery.

## The season rule that makes the years comparable

NDVI in Lahore changes more between March and October of one year than across a
decade of development. Picking whichever scene was clearest each year would
measure the timing of spring and call it tree loss.

So every year is sampled from **the same fixed window**, and within that window
we take the scenes nearest a fixed target date — deliberately *not* the least
cloudy one. A year with no usable scene in its window is **dropped**, never
substituted from another season. That is why the year scrubber has gaps: they
are real.

A single date is not enough either. On nearly identical calendar dates, Model
Town's vegetated fraction read 34% → 23% → 8% → 47% across 2017–2020 — that is
haze and rainfall timing, not tree loss. Since cloud and haze both *depress*
NDVI, each year is a **maximum-value composite** of several scenes near the
target date, which is the standard treatment for exactly this problem.

## Why species matching ignores climate

The original plan matched species from climate APIs. It cannot work, and that
was verified rather than assumed: NASA POWER returns **byte-identical**
temperature, wind and elevation for Model Town, Gulberg and DHA, because its
grid is ~50 km and all three fall in one cell. A climate-driven matcher would
recommend the same tree for every pin.

Species are matched instead on what actually varies site to site: land use,
available planting width, and proximity to water.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build

# Regenerate the data (slow: reads COGs over HTTP; results are cached)
pip install rasterio pyproj shapely numpy
python pipeline/run.py              # all three regions
python pipeline/run.py model-town   # just one
```

Screenshots of every surface: `node scripts/shots.mjs shots` (dev server must be
running). `node scripts/smoke.mjs` guards a map timing regression.

## Stack

MapLibre GL JS renders everything natively — basemap and data alike. There is no
deck.gl: version 9.3's `MapboxOverlay` reads `map.transform`, which MapLibre 5+
no longer exposes, so it throws on every frame. Native layers are better here
anyway, because they live inside the style and place labels above the data for
free.

React + TypeScript + Vite, Zustand for state. Static deploy, no backend.

## Project skills

`.claude/skills/` holds three skills written for this repo. Load them before
touching the relevant code:

| Skill | Load before |
|---|---|
| `chhaon-design-system` | any user-facing UI change |
| `map-ui` | any map code |
| `map-performance` | adding data to the map, or when it feels heavy |

`chhaon-design-system` is the locked visual direction and **overrides
`frontend-design` wherever the two disagree**. Contrast ratios and ramp
monotonicity in it are verified, not assumed — re-verify if you change a colour.

## Using it

| | |
|---|---|
| `1` – `4` | Canopy, Heat, People, Priority |
| `Q W E R T` | Jump between the five regions |
| `←` `→` | Step through years |
| `↑` `↓` | Walk the ranked sites |
| `Enter` | Zoom to the selected site |
| `L` | Show or hide the ranked list |
| `B` | Map or satellite |
| `D` | Light or dark |
| `M` | Method |
| `Esc` | Clear selection |

The ranked list filters by land use, species and people served, and exports to
CSV. Every site carries a copy-coordinates button and a link that opens the spot
in Google Maps. The URL hash holds region, view, year, selected site, theme and
basemap, so any view can be sent to someone.

## Docs

- `docs/SCREENS.md` — the surfaces and the single job each one does
- `pipeline/config.py` — regions, season windows, weights, species table
