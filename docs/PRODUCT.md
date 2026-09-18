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

That farmland shows up in change detection too, and it is the single most likely
question about the Change panel. The largest detected loss in the current run is
**53 ha at DHA's north-eastern edge**, 148 contiguous cells dropping from NDVI
0.57 to 0.33 between 24 August and 8 September 2026. That is a harvest: one
coherent block of cropland, not the scattered handful of cells a felling produces.

The detection is right and the interpretation would be wrong, which is exactly the
case the "a drop is not a cause" rule exists for. Say it before you are asked —
the same way we say it about DHA's correlation.

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

### 3.14 First paint carries one year, not nine

"Switch to vector tiles so only what's in the viewport loads" turned out to be
the wrong fix for the right problem, and measuring said so:

| DHA payload, gzip | | |
|---|---|---|
| NDVI, all 9 years | **105 KB** | **73%** — only one year is ever on screen |
| population | 19 KB | |
| surface temperature | 12 KB | |
| land use + built | 3 KB | |
| 120 ranked sites | 6 KB | |

Viewport culling does not apply here: each region is a *single* 60 m raster
painted as one image source, so the whole region already **is** the viewport, and
the only per-viewport vector data is 120 points at 6 KB. PMTiles would add a tile
pyramid to something far under the 2 MB / 5,000-feature threshold that
`map-performance` itself sets.

The actual waste was shipping eight years nobody had asked for. The core file now
carries only the latest year — the app's default, and the one `riskFor()` needs
for the risk band and the readout — and earlier years are separate files. DHA's
first paint went **144 KB → 53 KB**.

Two rules in `map-performance` pull in opposite directions here: "the map must be
interactive before the data arrives" wants the smallest possible first fetch, and
"filter, do not refetch — swapping datasets per year re-parses on every drag
frame" wants every year already in memory. Both hold if the visible year is
fetched on demand and the rest are prefetched at idle, so the scrubber is never
the thing waiting on the network.

**The prefetch hangs off MapLibre's `idle` event, not `requestIdleCallback`.**
That was a measured correction, not a preference: `requestIdleCallback` only knows
the main thread is free, so it fired immediately and pulled all eight years while
the basemap was still streaming — competing for the same 3G pipe as the map the
user was actually looking at. `idle` means the tiles have settled.
`scripts/progressive.mjs` now fails if a year file lands before the first layer
renders.

And the honest headline: on the **production** build, throttled to Fast 3G, the
measurements are on screen in **2.7 s**, repeatably. The app was never unusable on
3G — the dev server was, because it serves 11.5 MB of unbundled modules. Measure
the thing you ship. `scripts/budget.mjs --3g` prints the breakdown by origin and
kind.

That figure was wrong twice before it was right, both times because of the
measurement rather than the app. First the probe waited on `window.__map`, which is
only exposed in dev, so a production run sat until its timeout and reported 182 s.
Then it waited on any `<li>` in the ranked list — and the list renders an
empty-state `<li>` when it has no data, so it fired before a single measurement had
arrived and reported the shell's load time as the app's. It now waits on
`[data-site]`, which only exists once real sites are rendered.

The lesson is narrow and worth keeping: a performance probe that can pass without
the thing it measures will eventually report a number somebody puts in a README.

What is left on the critical path is the bundle, and it is mostly MapLibre. Method,
the mobile shell and the two tool panels are code-split out of it — the panels had
to be gated on their open flags as well as lazily imported, because they render
`null` when closed and `React.lazy` would otherwise have fetched them at mount
anyway. That is 8.7 KB gzip and, more usefully, no hooks running for a panel nobody
opened.

### 3.14a Two cadences over one measurement, and why they are never joined

The yearly layers answer "is 2025 different from 2017", and the season-locked window
is what makes that question answerable. They cannot answer "what has the canopy been
doing lately": one reading a year is the coarsest possible sampling of something that
moves every month.

| | window | answers |
|---|---|---|
| 2017–2024 | one fixed spring window a year | is this year different from that one? |
| 2024–2026 | every calendar month | what is happening now, and how does this month compare with the same month last year? |

**They share `grid.ndvi`, keyed by period, and they are never plotted as one
series.** Keeping the rasters in one map means the layer code needs no idea which
cadence it is drawing — a period key is a period key. But joining the *series* would
undo the annual window's entire purpose: a spring reading and a September reading are
not neighbouring points, which is precisely why the annual one is locked.

**Monthly rather than fortnightly, decided by counting.** Over the last 24 months of
Model Town, scenes under the cloud bar:

    monthly      14 of 16 non-smog months have >= 3 scenes
    fortnightly  19 of 32 non-smog fortnights do; 10 have one or two, 3 have none

Three scenes is the floor because compositing is the only thing that rejects haze.
A fortnightly series would be largely single-scene readings — the exact artefact
that produced 34% -> 23% -> 8% -> 47% on near-identical dates. The finest honest
cadence is the one the sky supports, not the one the satellite revisit suggests.

**A monthly series measures the season, and the UI says so in those words.** Model
Town: ~56% vegetated in October, 31% by June, 58% the following September. That
intra-year swing is larger than anything the decade of annual readings shows, which
is the product's own central claim made visible — and it is also why the only
year-on-year figure the panel offers is month-against-same-month.

**A third of the year is unreadable and the series shows it.** 13–15 of 24 months
per region carry a composite. The rest are Nov–Feb smog or monsoon months below the
scene floor, each drawn as a gap carrying its reason, in the scrubber and the chart
both. Zero would read as "no vegetation"; a labelled stub reads as "we could not
see", which is the truth.

Monthly composites are held to the yearly layers' 92% coverage bar rather than the
60% a single pass gets. A single pass is one observation and allowed to be partial;
a composite had several scenes to fill from and has no excuse.

### 3.15 Recent passes are a separate analysis, never mixed with the yearly ones

The yearly composites are locked to one spring window precisely so that 2017 and
2025 are comparable. That makes them useless for news: if a stand of trees comes
down in July, the next comparable observation is nine months away.

Sentinel-2's two satellites revisit every ~5 days, so the observations already
exist. `pipeline/recent.py` reads them as what they are — individual dated
observations, each with its own cloud and coverage — and looks for cells that were
vegetated and abruptly are not.

| | window | scenes | answers |
|---|---|---|---|
| `run.py` | one fixed spring window a year | multi-scene composite | is 2025 different from 2017? |
| `recent.py` | rolling, every usable pass | single scene | did something change last month? |

They are never combined. A single pass cannot carry a multi-year claim, and a
yearly composite cannot date an event.

Four rules keep it defensible:

- **Smog season is marked unusable, not deleted.** November to February aerosol
  depresses NDVI scene-wide, so those passes would show loss everywhere at once
  and recovery everywhere in March. Both are artefacts of the air. They stay in
  the record with the reason attached, because an unexplained gap looks like a bug
  and because "we cannot see the ground in December" is itself a finding.
- **A drop needs prior vegetation.** Bare ground going 0.10 to 0.02 is noise on a
  car park, not a felled tree.
- **Single cells are dropped.** One 60 m cell over the threshold is inside what
  sensor noise, a building shadow or a mown lawn can do. Three contiguous cells
  (~1.1 ha) is a change somebody can stand in.
- **The "before" reading is the per-cell maximum of earlier passes**, not the
  previous pass. One hazy earlier pass would otherwise read as that corner having
  recovered and then been cleared. A maximum is one-sided in the safe direction —
  it can miss a real loss but it cannot manufacture one, and for something
  accusation-shaped that is the correct way to be wrong.

**Two rules that only a real run produced.** The first execution against live
Sentinel-2 over Model Town reported **17 events, the largest 371 ha** — a quarter
of the neighbourhood. Both causes were design flaws, not code bugs, and both are
the same mistake in different clothes: trusting a single observation.

- **A pass can be fully visible and still unusable.** The 2026-09-13 pass cleared
  the 60% coverage floor and reported the region as **2.3% vegetated** against a
  38.6% median across its neighbours. Thin haze passes Sentinel-2's cloud mask
  while still depressing NDVI scene-wide — exactly the physics the yearly
  composites exist to defeat. Coverage cannot catch it, because the ground *was*
  visible; it was just wrong. So a pass whose region-wide vegetated fraction falls
  below 55% of the recent median is rejected as haze. The test is physical rather
  than statistical: a neighbourhood cannot lose a third of its vegetation in five
  days, and real felling is local — it moves a handful of cells, not the scene.
- **The baseline was a seasonal envelope.** Taking the per-cell maximum over every
  pass in a 120-day window means each cell at its greenest all summer, so a cell
  merely at its September low against a June peak read as loss. Bounded to the
  three most recent usable passes, "before" means what the ground was recently
  like — still a maximum over several observations, so haze in one of them cannot
  manufacture a loss.

After both: **2 events, the largest 2.2 ha**, and the hazy pass carries its own
explanation in the pass strip. That is the difference between a monitor worth
opening and one that cries wolf on its first run.

The lesson is the one in section 8 restated: nothing threw, nothing errored, and
every automated check passed. It took running the thing against reality and
looking at whether the number was physically possible.

**It never says why.** Felling, fire, harvest, construction clearance and a mown
lawn are indistinguishable from orbit. The output says what changed and when; the
citizen log is where a cause comes from.

The rules live in `pipeline/change.py` as pure array logic, separate from the COG
reading, so `test_logic.py` checks them with numpy alone in two seconds rather
than needing the network and the whole geospatial stack.

**The reads run six at a time.** They are HTTP range requests that spend almost all
their time waiting, so a thread pool is the right tool: 16 reads over Model Town
took **124 s serially and 53 s at six**, and all five regions warm now finish in
24 s. Output is byte-identical at 1, 6 and 12 jobs — verified, because concurrency
that changed what got reported would be a far worse bug than a slow script.

The bound is deliberate and the default is modest. Element 84's catalogue is free
and run for everyone; the aim was to stop wasting our own wall time, not to extract
maximum throughput from somebody else's infrastructure. `--jobs N` overrides it.

**`run.py`'s compositing loop is left alone**, and that is a considered choice
rather than an oversight. It is the genuinely slow half — up to eight scenes a year
across ten years — and parallelising its first three reads would help. But its loop
is adaptive: it decides whether to read another scene based on the coverage of what
it already has, so the refactor is not trivially order-preserving. More to the
point, it could not be verified here without a full uncached run, which would also
rewrite the committed yearly layers — the highest-stakes data in the product. A
silent change to those is worse than a slow script, and the same reasoning that
makes `baseline_before` one-sided applies to touching them at all.

### 3.16 Watches are one place each, and they do not notify

A monitor that fires on every flicker is muted within a week, and a muted monitor
is worse than none because it looks like coverage. So:

- A watch is a **drawn area**, not a region. "Somewhere in Lahore" is not
  something anyone can act on.
- Each carries its **own threshold**, defaulting to the pipeline's own floor.
- An alert is raised once and can be **acknowledged**, which keeps it in the
  record but stops it competing with the next one.
- Only **usable** passes can raise one, which the pipeline already enforces by
  excluding smog season from detection.

Who it is for: a journalist watching one contested plot, an NGO watching a green
belt, someone assembling evidence for a petition. All three need "tell me about
this specific place", not a feed.

**There is no push and the panel says so.** Static site, no server, nothing to
send an email with. Watches are evaluated when the app opens. Claiming otherwise
would be a promise the architecture cannot keep, and it is exactly the kind of
claim that gets found out on stage.

### 3.17 Citizen reports are a public log, not a complaint

At 10 m/px a street tree is smaller than one pixel. Felling one moves nothing we
measure — which is exactly why the product says "green cover, never tree canopy".
A person on the ground is the only way it enters the record, and that is the gap
this closes.

**What it deliberately does not do:** claim anyone was notified. There is no
public API to file against, and an email to the PHA is a message in an inbox, not
a workflow. Promising "the authorities have been alerted" would be the single
most dishonest thing in this product.

Two tiers, never blurred in the UI:

| | |
|---|---|
| **The public log** | `public/data/reports.json`, committed — public, timestamped, auditable in git history, and it exists whether or not anyone acts on it |
| **Local drafts** | IndexedDB, this browser only, labelled as not public everywhere they appear |

Details that matter:

- **Export merges with the current public log** before downloading, so committing
  the file cannot drop somebody else's entries. "Export mine, overwrite theirs" is
  a silent and unrecoverable failure.
- **Photos are resized to 1280 px and re-encoded**, which drops EXIF as a side
  effect. A photo bound for a public log should not carry the reporter's camera
  serial number; the only location kept is the one they placed deliberately.
- **IndexedDB, not localStorage**, because a 1280 px JPEG is 100-250 KB and
  localStorage's ~5 MB quota is shared with everything else — a handful of reports
  would start throwing on the one action the user most expects to succeed.
- The **Citizen Portal** is offered with copyable text, because that is the route
  that gets a tracking number and we cannot walk it for them.

### 3.18 Text to filter, not a chatbot

`worst hit areas in johar town` sets the region, the view and the filters. The
Urdu equivalent does the same.

It is a **deterministic phrase matcher with no model and no network**, and that is
the entire design. A model writing sentences about this data would eventually
state a number nobody measured, and every figure in this product is traceable to a
named satellite scene. A parser that can only *select* — from five regions, five
views, the years the pipeline actually produced, the species that appear in the
ranking — has no mechanism for inventing anything.

- **It cannot hallucinate.** There is nothing to hallucinate with.
- **It is auditable.** It reports what it matched *and what it ignored*, so the
  user can see they were understood rather than guessed at.
- **Urdu costs almost nothing**, because setting a filter needs recognition, not
  generation. It is a synonym table, not a second language model.
- **It works offline**, like everything else here.
- **When it understands nothing it says so.** Silently doing nothing is the one
  genuinely bad outcome — a user cannot tell that from a broken feature.

Two bugs worth remembering, both caught by the end-to-end check:

- "neem sites on roadsides **serving more than 5000 people**" selected the
  *Population* view, because the trailing "people" matched a view synonym. Fixed by
  consuming each matched phrase as it is taken, and running the numeric threshold
  rule first. A phrase matcher is supposed to be immune to this kind of thing; it
  only is if you consume as you go.
- "roadside**s**" matched nothing, so the filter was silently dropped — which looks
  exactly like the feature not working. The matcher now tolerates a plural.

### 3.19 Three mark shapes, three kinds of claim

There are now three kinds of mark on the map, and each is a different kind of
statement:

| shape | meaning |
|---|---|
| **circle** | a ranked planting site — what we recommend |
| **diamond** | a citizen report — what a person saw |
| **triangle** | a detected loss — what the satellite measured changing |

Deliberately far apart rather than three sizes of the same dot. Confusing a
recommendation with an accusation would be the worst of the available mistakes,
and selection is already a hairline ring around a circle — so a hollow circle for
a report would have read as a selected site.

Colours stay inside the existing palette: loss takes the hot end of the thermal
ramp, because losing canopy is a heat event; a new planting is the one case where
canopy green is legitimate, being literally new canopy.

### 3.13 Mobile is a different layout, not a smaller one

Below 900 px the app renders a separate shell rather than a responsive squeeze.
The measurement that forced it: on a 390 px phone the rail (72 px) and the
vertical legend (88 px) left **230 px of map**, and the ranked list, tools and
readout were all set to `display: none`. That is a husk, not a small version.

The mobile shell is the pattern every map app converges on:

- **Full-bleed map**, with a draggable bottom sheet at two snap points (34% peek,
  82% full). Tap the handle to toggle, drag it to choose.
- **View tabs at the top of the sheet**, so switching layers works in either
  state without expanding first.
- **Thumb-height chips** for region, area select, air and cost — the tools that
  matter are one tap from the map, not behind a menu.
- **Horizontal legend**, because the vertical one is a quarter of a phone screen.
- **Panels become sheets** — site plate, air and cost all slide up over the map.
- **Safe-area aware**, so nothing hides under a notch or home indicator.
- Selecting a site auto-expands the sheet, because otherwise the plate opens
  behind it.

`scripts/mobileshots.mjs` runs a real iPhone viewport with touch emulation and
fails on horizontal overflow or any tap target under 34 px. Map attribution
links are the one exclusion: a licence obligation at a conventional size, not
primary interface.

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
- **A detected loss may be agriculture.** DHA's bounds reach cropland, and a
  harvested field produces a larger, cleaner NDVI drop than any felling. The
  product never names a cause; pair an event with a citizen report before calling
  it tree loss.
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
python pipeline/recent.py         # the fast rolling stage — recent passes, detected loss
python pipeline/monthly.py        # monthly composites, recent 24 months (~2 min/region)
python pipeline/split_years.py    # re-shape committed grids into core + per-year files
```

The pipeline is two stages with different cadences. `run.py` builds the decade of
yearly layers and rarely needs re-running. `recent.py` is meant to run on a
schedule: it reuses the grid `run.py` wrote, reads only passes it has not seen,
and is what keeps the Change panel current.

`split_years.py` is stdlib-only on purpose — it re-shapes data that is already
committed, so it must run without rasterio, without network, and without
repeating an hour of COG reads. `run.py` imports its writer rather than
reimplementing it, so a full run and the migration cannot drift into two
different on-disk layouts.

### Verification, all of which must pass before shipping

```bash
python pipeline/test_logic.py      # scoring, species matching, compositing, change rules
python pipeline/qa.py              # data sanity across every region
node scripts/smoke.mjs             # map timing regression + rendered dot count
node scripts/progressive.mjs       # first paint stays small; the scrubber really repaints
node scripts/features.mjs          # reporting, change detection, watches, text-to-filter
node scripts/mobileshots.mjs       # no overflow, no tap target under 34px
npm run build && npx vite preview --port 4173
node scripts/prodcheck.mjs         # the production build, where the worker bug hid
CHHAON_ORIGIN=http://localhost:4173 node scripts/budget.mjs --3g
node scripts/shots.mjs shots       # screenshots of every surface
```

`test_logic.py` imports `run.py` lazily, so the checks that need numpy alone —
including every change-detection rule — still report when rasterio is not
installed, instead of one missing optional dependency hiding every result after
it. Skips are printed and named.

`features.mjs` drives the Change panel from a **fixture served by route
interception**, not from committed data. The alert path has to be testable
without inventing satellite observations, because the one thing this product must
never do is ship numbers nobody measured.

Both new browser checks assert on state the user would have to notice was
missing — the request log, the rendered image bytes, the applied filter chips —
rather than on a layer merely existing. That is the lesson from every bug in
section 8: the failure was silent.

`qa.py` parses the way a browser does. It catches dead layers, collapsed
rankings, rank-order violations, sites outside the analysed grid, and JSON that
Python will happily write but `JSON.parse` rejects.

Since the payload split it also checks that **every year the metadata promises
actually resolves** — inline or as its own file, with matching dimensions. A year
listed in `years` with no data behind it is a dead scrubber tick, and it would be
invisible in the UI: the layer simply keeps showing the previous year.

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
| Every recommendation was Neem | First-match-wins species selection; Neem is listed first with the lowest width bar |
| A drawn area was never committed | `mouseup` was bound to the *map*, so releasing over any overlay — the attribution control in the corner, a panel, the ranked list — never reached it. The box stayed on screen and nothing happened. Move and release are now bound to the window |
| Report markers drew nothing | A `zoom` interpolate nested inside a `case` on `icon-size`. Same class of bug as the site circles above, reintroduced in new code — MapLibre needs zoom at the **top level** of the property |
| "serving more than 5000 people" switched to the Population view | The trailing "people" matched a view synonym. The query parser now consumes each phrase as it matches and runs numeric rules first |
| "roadsides" matched no filter | The phrase matcher only knew the singular, so the filter was silently dropped — indistinguishable from the feature not working |
| The year prefetch fought the basemap | `requestIdleCallback` fires as soon as the main thread is free, which on a fast machine is immediately — while basemap tiles are still streaming. Hang background fetches off MapLibre's `idle` instead |
| 17 detected "losses", largest 371 ha | A haze-affected pass cleared the coverage floor at 2.3% vegetated against a ~40% norm, and the baseline was the maximum over four months. Both fixed; both invisible until the numbers were checked against physical plausibility |
| The Priority legend disagreed with the map | Priority's domain comes from the ranking, not the grid, so `domainFor()` returned a hard-coded 0.25–0.95 while the circles were painted from the real spread (0.33–0.80 in Model Town). Four views honoured the single-source rule and the fifth quietly did not |
| The 3G load figure was measured wrong, twice | The probe waited on `window.__map` (dev-only, so production reported its 182 s timeout), then on any `<li>` in the ranked list — which matches the empty-state row, so it fired before any data arrived and reported 2.5 s. A perf probe that can pass without the thing it measures will eventually put a wrong number in a README |
| Area-select and report placement could not be told apart | Both armed the map's click handler. Placement now skips when the other is armed, and arming either disarms the other in the store |
| `write_year` could not write a month | It called `int(period)` on '2024-10'. Generalised to `write_period`, with the cadence in the filename rather than inferred |
| The legend check started comparing the wrong view | It inherited whatever view the previous check left behind, and a new check began leaving the map on Canopy — so it compared the canopy domain against site scores and failed for a reason that was not there. A test that depends on running order will eventually lie |

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
