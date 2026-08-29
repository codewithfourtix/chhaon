# Chhaon — the whole product, for the team

Everything a new person needs: what it claims, what it measures, every decision
we made and why, and the things that would break it under questioning.

Read `README.md` first for the short version. This is the long one.

---

## 1. What Chhaon claims

> **In Lahore, shade is worth 3.2 °C.**

Bare ground in Model Town runs 3.2 °C hotter at the surface than well-vegetated
ground **in the same satellite pass** — correlation −0.65 across 4,680 cells.

From that, Chhaon finds where shade is missing, works out how many people each
gap affects, ranks the ground worth planting, and names a species for each site.

### What it deliberately does not claim

**We do not claim Lahore is losing its canopy.** We looked, and the data does not
support it. Model Town reads 35.5 % vegetated in 2017 and 34.7 % in 2025, having
swung between 23.8 % and 49.2 % in between. Spring vegetation in Punjab tracks
winter rainfall far more strongly than it tracks development.

That negative result is stated on the Method screen, first, before anything
else. It is the single most likely thing for a technical judge to attack, and
saying it ourselves is what makes the positive finding believable.

The heat gap needs no trend at all. It is a within-scene comparison — same day,
same sensor, same atmosphere — which is why it survives scrutiny.

---

## 2. The data

| Layer | Source | Native resolution | Licence |
|---|---|---|---|
| Green cover (NDVI) | Sentinel-2 L2A via Element 84 Earth Search | 10 m | Free, open |
| Surface temperature | Landsat 8/9 C2 L2 via Microsoft Planetary Computer | 100 m | Free, open |
| Plantable land | OpenStreetMap via Overpass | vector | ODbL |
| Population | WorldPop 2020 constrained | 100 m | CC BY 4.0 |
| Basemap | OpenFreeMap (OSM) | vector | ODbL |
| Imagery | Esri World Imagery (Maxar, Earthstar) | raster | Attribution required |

**No API key is needed for any of it.** Everything is precomputed by
`pipeline/run.py` and committed under `public/data/`, so the app makes **zero**
runtime API calls and nothing can time out during a demo.

### Why not Google Earth Engine

The original plan named it. It turned out to be unnecessary and would have added
an account, a Cloud project and an approval wait. Sentinel-2 COGs are readable
anonymously over HTTP range requests, and Landsat thermal is reachable through
Planetary Computer's anonymous SAS tokens. USGS's own endpoint needs an ERS
login and the AWS bucket is requester-pays — Planetary Computer is the way in.

---

## 3. Decisions, and the reasoning behind each

### 3.1 Scenes are anchored to a fixed day-of-year, not chosen by cloud cover

Picking each year's least-cloudy scene put 2020 on 2 April and 2021 on 3 March.
A month of spring drift moves NDVI more than a decade of development does. Every
year is now sampled from a fixed window and, inside it, we take the scenes
**nearest a fixed target date**.

### 3.2 Each year is a multi-scene maximum-value composite

A single date could not carry the claim either. On nearly identical dates Model
Town read **34 % → 23 % → 8 % → 47 %** across 2017–2020. That is Lahore's spring
haze, not tree loss.

Cloud and haze both *depress* NDVI, so the per-cell maximum across several
scenes rejects them. This is the standard treatment. Compositing lifted 2017
from 18 % usable cells to 100 %.

### 3.3 Coverage is adaptive, and a partly covered year is dropped

Regions near a Sentinel-2 tile edge can have a year whose nearest scenes only
partly cover them. We keep pulling the next nearest scene until coverage clears
**92 %**; if it never does, the year is **dropped**.

A hole in the raster reads as "no trees here" when it means "no data here". That
is why the year scrubber has gaps — they are real, and they are honest.

### 3.4 Species matching ignores climate, and we proved it had to

The obvious approach is climate data per coordinate. It cannot work here, and we
verified rather than assumed: **NASA POWER returns byte-identical temperature,
wind and elevation for Model Town, Gulberg and DHA** — its grid is ~50 km and all
three fall in one cell. A climate-driven matcher would recommend the same tree
for every pin on the map.

Species are matched on what actually varies site to site: land use, available
planting width, and proximity to water. The shortlist comes from Punjab Forest
Department and University of Agriculture Faisalabad guidance for central Punjab.

### 3.5 Measured fields are rasters, not polygons

Temperature and vegetation are continuous fields. Drawing one polygon per 60 m
cell produced an opaque, blocky sheet that hid the ground. We paint one pixel
per cell to a canvas and let the GPU interpolate, at 0.78 opacity over the map
and 0.62 over imagery, with feathered edges and a dashed study-area outline.

Seeing the streets *through* the heat is what makes it read as a place.

### 3.6 Every colour domain comes from the data

A hard-coded ramp is a design bug. Population runs 101–162 people/ha; mapped
onto a 0–400 domain every cell landed within 8 % of every other and the layer
read as a flat grey rectangle. Surface temperature had the same fault quietly.

`domainFor()` clips to p2–p98, and **the map and the legend both read from it**,
so the two cannot drift apart.

### 3.7 Species matching is scored best-fit, with a diversity constraint

The first version returned the **first species in list order** that cleared the
land-use and width bars. Neem is listed first and clears roadside at 3 m — the
lowest bar of any species — and roadside is 91–100% of plantable public land
here. So Neem won almost every site and Amaltas was never reached: every region
shipped **91–100% Neem**.

That is a real urban-forestry failure, not a cosmetic one. A uniform avenue
loses the whole street to a single pest or disease sweep.

Eligible species are now scored on:

- **canopy delivered** — shade is the product, so more mature crown is better;
- **drought fit** against the site's own NDVI;
- **water affinity** against whether the ground is canal-side;
- an explicit **diversity term** that pushes down any species already over its
  share (`MAX_SPECIES_SHARE`, 40%).

Result: 4–7 species per region, top share **37–45%**.

One bug caught while building it: the first scoring attempt rewarded *headroom*
above the minimum width, which favoured whichever species needed the least room
and handed every dry verge to **Moringa** — a small, short-lived tree. That
would have replaced one monoculture with a worse one. `test_logic.py` now pins
the forestry, not just the code: a dry narrow verge must return Neem, canal-side
must return Arjun, a large park must return Pipal.

### 3.8 CO2 and PM2.5 are one coefficient, not seven invented constants

Both are **estimates**: ~0.44 kg CO2 and ~1.2 g PM2.5 per m² of mature crown per
year, from standard urban-forestry figures, applied to each species' crown area.
Stating one coefficient openly is more defensible than inventing per-species
field data we do not have for Lahore.

The totals are honest and modest — all 600 sites fully grown come to about
**19 tonnes CO2/year, roughly 4 cars' worth**, plus
~51 kg of PM2.5. Urban planting at this scale is a heat and air-quality
intervention, not a carbon strategy, and we say so rather than inflating it.

### 3.9 Risk bands are a relabelling, not a new analysis

Surface temperature above the region's own vegetated baseline, weighted 60/40
against canopy absence, cut into four **fixed** bands. Fixed deliberately:
clipping the edges per region would make "High" mean something different in each
one, which defeats comparing places. Defined once in `src/data/risk.ts` so the
map, legend and summary statistic cannot drift apart.

### 3.10 Sub-area selection, cost, and full-layer export

**Sub-area.** A department rarely asks about "Model Town" — they ask about one
ward, one corridor, the blocks around a school. Drawing a box recomputes
vegetated cover, mean surface temperature and population over just those cells.
It is a bounding query over the raster grid already in memory: no new data, no
server. Below a quarter coverage the cover figure is withheld rather than shown
with a caveat nobody reads.

**Cost.** A map without a budget line is a picture, not a proposal. The default
of PKR 1,200 per tree — a sapling plus roughly three years of establishment care
— is a **starting figure the planner is expected to overwrite**, and the field is
editable for exactly that reason. Larger species cost more to establish, so the
total is weighted by crown size.

**Full-layer export.** Two formats, because they answer different questions.
*Grid GeoJSON* is one polygon per 60 m cell carrying every measured value —
loads straight into QGIS, joins and symbolises. *GeoPNG* is the rendered layer
plus an ESRI world file, written from the same canvas the map draws, so what
lands in the GIS is exactly what was on screen. GeoTIFF would mean shipping an
encoder; a world file is two lines and every GIS reads it.

Cells with no reading are dropped from the export rather than written as zero —
a gap has to stay a gap once it is in someone else's GIS, where our caveats
are not.

### 3.11 Dark and satellite are the defaults

It is a thermal instrument. It reads better dark, and the measured fields land
on real ground, which is what makes them believable at a glance.

---

## 4. How a site is scored

Every plantable 60 m cell gets a score from three measured terms:

| Weight | Term | Meaning |
|---|---|---|
| **0.45** | Heat need | How far above the region's own well-vegetated baseline this cell's surface runs |
| **0.30** | Canopy absence | How far below the vegetation threshold the cell sits today |
| **0.25** | People served | WorldPop density in the surrounding cells |

A cell qualifies only if OpenStreetMap shows it as genuinely plantable public
ground — park, road verge, canal bank or vacant land — with enough open area
(≥12 % of the cell) and not covered by a building. Sites are spaced ≥240 m apart
so the ranking never returns the same block twice.

**The weights are our judgment, not a measurement.** Nobody established that heat
should count 45 %. They are shown openly on every site so anyone can disagree
with them, and they are the first thing to argue about.

---

## 5. The five regions

| Region | Shade worth | NDVI/LST r | Baseline | Sites |
|---|---|---|---|---|
| Model Town | **3.2 °C** | −0.65 | 39.5 °C | 120 |
| Gulberg | **2.6 °C** | −0.51 | 40.2 °C | 120 |
| Iqbal Town | **2.3 °C** | −0.59 | 40.9 °C | 120 |
| Johar Town | **1.8 °C** | −0.37 | 41.2 °C | 120 |
| DHA | **0.9 °C** | −0.20 | 41.8 °C | 120 |

**DHA is the weak one and we do not hide it.** Its bounds reach into farmland at
the southern edge, which blurs the built-versus-vegetated contrast the whole
measurement depends on. If anyone probes a single region, it will be that one.

---

### 3.12 Why there is no AQI reading

The obvious smog feature is "AQI here, before and after". It was specified, and
we did not build it as specified, because it cannot be built honestly:

- **Measured AQI does not exist at neighbourhood scale.** Lahore has a handful of
  ground stations. Every free API serving them now needs a key — OpenAQ v3
  returns 401, v2 is retired (both verified, not assumed).
- **Satellite air quality is too coarse.** Sentinel-5P is open and keyless and
  we confirmed NO2 granules over Lahore. But its pixels are 5.5 × 3.5 km and our
  regions are 4–8 km across, so all five would read nearly the same number —
  the identical failure that made us drop climate data from species matching.
  A single granule is also 64 MB and timed out at nine minutes on one download.
- **Captured mass is not an AQI delta.** Converting kilograms of PM2.5 removed
  into AQI points needs a dispersion model, mixing heights and background
  concentrations we do not have.

**The answer to the spec's open question** — "two years, or predicted-with-more-
trees versus current?" — is *neither, as stated*. Option one needs per-area AQI
that does not exist at 5.5 km. Option two needs the dispersion model.

So the Air panel reports what we can defend: the particulate the recommended
planting would capture, per region or per drawn area, from crown area and one
published coefficient. It says what planting would **remove**, never what the air
currently **is**, and the panel carries a "why no AQI reading?" disclosure
explaining exactly this.

## 6. Honest limits — say these before you are asked

- **"Green cover", never "tree canopy".** At 10 m/px a vegetated cell may be
  lawn, crop, scrub or canopy. We cannot count trees.
- **"Surface temperature", never "temperature".** Land surface temperature runs
  far hotter than air, and Landsat passes over Lahore mid-morning — so these are
  morning surface temperatures, not the afternoon peak.
- **60 m cells.** A cell is a neighbourhood-scale statement, not a parcel. A site
  marks *a 60 m square worth surveying*, not a hole to dig.
- **Plantability is a proxy.** We have not checked ownership, buried utilities,
  or whether a verge is actually free.
- **Population barely varies** (125–160 /ha), so "people served" discriminates
  between sites less than the other two terms do.
- **Species matching is best-effort.** Confirm with the Parks & Horticulture
  Authority or a nursery.
- **No trend.** If someone expects a "Lahore is losing its trees" chart, this
  data does not give one.

---

## 7. Reproducing it

```bash
npm install
npm run dev                       # http://localhost:5173
npm run build

pip install rasterio pyproj shapely numpy
python pipeline/run.py            # all five regions (slow, results are cached)
python pipeline/run.py model-town # one region
```

### Verification, all of which must pass before shipping

```bash
python pipeline/test_logic.py   # scoring, species matching, compositing — offline
python pipeline/qa.py           # data sanity across every region
node scripts/smoke.mjs          # map timing regression + rendered dot count
npm run build && npx vite preview --port 4173
node scripts/prodcheck.mjs      # the production build, where the worker bug hid
node scripts/shots.mjs shots    # screenshots of every surface
```

`qa.py` parses the way a browser does. It catches dead layers, collapsed
rankings, rank-order violations, sites outside the analysed grid, and JSON that
Python will happily write but `JSON.parse` rejects.

---

## 8. Bugs that cost us real time — do not reintroduce these

| Symptom | Cause |
|---|---|
| Map completely blank | Vite's dep optimiser broke MapLibre's worker. Fix: `optimizeDeps.exclude` |
| A view silently stopped switching | Used `isStyleLoaded()`, which reports *tile* loading and flaps to false forever |
| Dark theme blanked the whole app | `setState` race against `setStyle`; readiness needs a synchronous ref |
| Data layers vanished on basemap switch | A boolean went `true → false → true` in one React batch, so the effect never re-ran. Use a counter |
| Every layer was one flat band | Grid's UTM bounds tuple had the north corner set to the south value |
| Whole app loaded nothing | `NaN` in JSON. Python writes it; `JSON.parse` rejects it. Now `allow_nan=False` |
| 120 site dots drew nothing | Zoom expression nested inside a multiply — MapLibre needs it at the top level of a paint property |
| Every Landsat read 403'd mid-run | Planetary Computer SAS tokens expire in under an hour and were cached without honouring it |
| Overpass returned 406 | Needs a `User-Agent`. Buildings must be a separate query or it times out |
| Vector basemap blank **in production only** | MapLibre builds its worker URL from a ternary at runtime, so Vite never emitted the file; a static host answered with index.html and `new Worker` hung on HTML. Raster basemaps never touch the worker, so satellite looked fine — see `vite.config.ts` |
| Every Landsat read 403'd mid-run | Planetary Computer SAS tokens expire in under an hour and were cached without honouring it |
| Every recommendation was Neem | First-match-wins species selection; Neem is listed first with the lowest width bar |

The pattern in most of these: **the failure was silent.** Nothing threw. That is
why the checks now count rendered features and parse strictly, rather than
asserting that a layer merely exists.

---

## 9. Project skills

`.claude/skills/` carries three skills written for this repo. Load them before
touching the relevant code:

| Skill | Load before |
|---|---|
| `chhaon-design-system` | any user-facing UI change |
| `map-ui` | any map code |
| `map-performance` | adding data to the map, or when it feels heavy |

`chhaon-design-system` is the locked visual direction and **overrides the
official `frontend-design` plugin wherever the two disagree**. Its contrast
ratios and ramp monotonicity are verified, not assumed — re-verify if you change
a colour.
