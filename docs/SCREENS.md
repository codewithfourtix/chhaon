# Chhaon — Screen Inventory

Every surface states its single job. If a surface cannot answer its job in one
sentence, it gets cut.

---

## 1. Overture

**Job:** In ten seconds, state the one thing we actually measured.

A cold open on the map, already zoomed to Lahore, already scrubbing through the
years of observed green cover. The headline is the measured heat gap — how much
hotter bare ground runs than vegetated ground in the same satellite pass. No
feature grid, no "Get Started" button. The map is the hero because the map is
the product.

**It does not claim canopy loss.** The multi-year series does not show one:
spring vegetation in Lahore tracks winter rainfall far more strongly than it
tracks development. The within-scene heat gap needs no trend and survives
scrutiny; a loss narrative would not.

One action out: **Open the workspace.** The camera continues from exactly where
the overture left it — no cut, no reload.

Contains: live map (non-interactive), year counter, the heat-gap figure,
wordmark.

---

## 2. Map Workspace

**Job:** Let a planner move between the ways of seeing one neighbourhood.

The permanent home of the product. Full-bleed map, instrument rail on the left,
thermal scale pinned right, year scrubber along the bottom. Everything else is
transient and overlays this.

Five data views, one at a time, never stacked into mud:
- **Canopy** — where green cover stands, by year
- **Heat** — land surface temperature
- **People** — population density
- **Risk** — Low / Medium / High / Critical, from heat and shade deficit
- **Priority** — the ranked planting sites (the answer view)

Contains: base map, active data layer, instrument rail, command bar, thermal
scale, scrubber, region switch (all five), tools, attribution.

---

## 3. Instrument Rail

**Job:** Switch what you're looking at without ever leaving the map.

A narrow vertical rail, not a floating panel and not a hamburger. Five view
switches, the five region switches, Method and theme pinned to the foot. The live
readout — feature count, year range, data resolution, baseline, high-risk share —
lives in the bottom bar, because the rail could not hold it without clipping the
buttons underneath.

Collapses to icons under 1100px. Never disappears entirely.

---

## 4. Site Plate

**Job:** Answer "why here, and what do I plant?" for one site.

Opens when a priority site is clicked. An inset plate over the map — not a modal,
not a default map bubble. The map stays visible and the selected site stays lit.

Carries, in this order:
- Site identity: coordinates, land use, area
- **Heat cost** — surface temperature vs. the neighbourhood's shaded baseline
- **People served** — population within walking distance
- **Score breakdown** — the ranking formula with its weights, shown openly
- **Estimated benefits** — clearly labelled estimates, not measurements
- **Recommended species** — with the site conditions that produced the match
- The honest caveat: best-effort match, confirm with PHA or a nursery

Dismisses on Escape, on outside click, and on selecting another site.

---

## 5. Year Scrubber

**Job:** Show observed green cover per year — as an observation, not a trend.

A horizontal scale along the bottom of the workspace. Moving it re-reads the
canopy layer for that year, and the cast shade grows and shrinks with the
measured vegetation. Not a before/after toggle — a continuous instrument.

Marks only the years with usable imagery inside the fixed season window. Never
interpolates between them; gaps read as gaps, because they are real.

Years load progressively — the core file ships the latest one and the rest arrive
once the map is idle — so a drag never waits on the network.

The label says what this is: an observation. Interannual variation here is
dominated by rainfall, and the interface must not imply otherwise.

---

## 6. Command Bar

**Job:** Turn a sentence into map state, in English or Urdu.

`worst hit areas in johar town` moves the region, the view and the filters.
A deterministic phrase matcher, not a chatbot: it answers by moving the map and
never by writing sentences, so it has no mechanism for stating a figure nobody
measured.

Shows what it matched **and what it ignored**, before anything else. A control
that silently reinterprets an instruction is worse than one that refuses — and
when it understands nothing it says so, because silence is indistinguishable
from a broken feature.

`/` focuses it. On mobile it lives inside the sheet rather than over the map.

---

## 7. Change

**Job:** Say when the ground was last seen, and what has changed since.

Recent Sentinel-2 passes, detected losses, and watched areas — one surface,
because they are one story.

- **Pass strip** — every pass in the window, usable or not. The unusable ones are
  shown with their reason: a gap nobody explains looks like a bug, and "we could
  not see the ground for six weeks" is itself the finding in smog season.
- **Detected loss** — clusters where vegetated ground abruptly lost its signal,
  largest first, each with the two dates it compared. Clicking one flies to it.
- **Watched areas** — one drawn box each, with its own threshold and an
  acknowledge action, so an alert still means something when it arrives.

States plainly that there is no push (no server to send one) and that a detected
drop is **not a cause** — felling, fire, harvest and a mown lawn are identical
from orbit.

---

## 8. Report

**Job:** Record what the satellite cannot see, without pretending it was filed.

A street tree is smaller than one satellite pixel, so felling one moves nothing
we measure. This is the only route by which it enters the record.

Place a pin, pick what happened, add a photo and a note. Two tiers, never blurred:
the **public log** (`public/data/reports.json`, committed, timestamped,
auditable) and **local drafts** (this browser only, labelled as such everywhere).

Nothing on it claims a department was alerted. The Citizen Portal is offered as
the route that does have a workflow, with copyable text, because we cannot walk
it for the reporter.

---

## 9. Methodology

**Job:** Survive a technical judge reading it closely.

The credibility surface, and the one screen that is typographic rather than
spatial. Written to be read, not skimmed.

Opens with **what we found and what we did not** — including, in plain words,
that no monotonic decline in green cover was found and why that series cannot
carry such a claim. Then: every data source and its licence; the native
resolution of each layer and what that lets us claim; the scoring formula and
its weights; why we say green cover rather than tree canopy; why we say surface
temperature rather than temperature; why species matching cannot use climate;
why there is no AQI reading; and the exact scenes used.

Naming the limits is the point. Stating the negative result is what makes the
positive one believable.

---

## Rules that apply to all of them

- One data view at a time. Layers never stack into an unreadable mud.
- The map never blocks. Data loads progressively; the base map is interactive
  from the first frame.
- Every number on screen carries its unit and, where it matters, its resolution.
- Keyboard reaches everything: view switches, scrubber, site selection, panel
  dismissal, the command bar.
- Reduced motion is honoured — the shade animation becomes a cross-fade.
- Light and dark are both first-class. Neither is an afterthought skin.
- **Three mark shapes, three kinds of claim**, never interchangeable: a circle is
  a ranked planting site (what we recommend), a diamond is a citizen report (what
  a person saw), a triangle is a detected loss (what the satellite measured
  changing).
- Nothing claims to have notified anyone. There is no server to do it with.
