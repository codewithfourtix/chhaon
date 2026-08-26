# Chhaon — Screen Inventory

Six surfaces. Nothing else ships. Every screen states its single job; if a screen
cannot answer its job in one sentence, it gets cut.

---

## 1. Overture

**Job:** In ten seconds, make the loss felt — before any interface appears.

A cold open on the map, already zoomed to Lahore, already scrubbing backwards
through the years. Shade retreats across the city while a single line of type
counts the loss. No hero headline, no feature grid, no "Get Started" button.
The map is the hero because the map is the product.

One action out: **Open the workspace.** The camera continues from exactly where
the overture left it — no cut, no reload.

Contains: live map (non-interactive), year counter, the loss figure, wordmark.

---

## 2. Map Workspace

**Job:** Let a planner move between the four ways of seeing one neighbourhood.

The permanent home of the product. Full-bleed map, instrument rail on the left,
thermal scale pinned right, year scrubber along the bottom. Everything else is
transient and overlays this.

Four data views, one at a time, never stacked into mud:
- **Canopy** — where green cover stands and where it went
- **Heat** — land surface temperature
- **People** — population density
- **Priority** — the ranked planting sites (the answer view)

Contains: base map, active data layer, instrument rail, thermal scale, scrubber,
region switch (Model Town / Gulberg / DHA), attribution.

---

## 3. Instrument Rail

**Job:** Switch what you're looking at without ever leaving the map.

A narrow vertical rail, not a floating panel and not a hamburger. Four view
switches, the region switch, and a live readout of what is currently on screen —
feature count, year range, data resolution. The readout is what makes it read as
an instrument rather than a toy: it always tells you what you are actually
looking at.

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
- **Recommended species** — with the site conditions that produced the match
- The honest caveat: best-effort match, confirm with PHA or a nursery

Dismisses on Escape, on outside click, and on selecting another site.

---

## 5. Year Scrubber

**Job:** Make the loss visible as motion, not as a statistic.

A horizontal scale along the bottom of the workspace. Dragging it moves the
canopy layer through the years, and shade physically retreats and returns across
the map. Not a before/after toggle — a continuous, scrubbable instrument.

Marks the years we actually have imagery for. Never interpolates silently
between them; gaps read as gaps.

---

## 6. Methodology

**Job:** Survive a technical judge reading it closely.

The credibility surface, and the one screen that is typographic rather than
spatial. Written to be read, not skimmed.

States plainly: every data source and its licence; the native resolution of each
layer and what that means we can and cannot claim; the exact scoring formula and
its weights; why we say green cover rather than tree canopy; why we say surface
temperature rather than temperature; the species-matching logic and its limits.

Naming the limits is the point. A tool that states its resolution is a tool that
has been thought about.

---

## Rules that apply to all six

- One data view at a time. Layers never stack into an unreadable mud.
- The map never blocks. Data loads progressively; the base map is interactive
  from the first frame.
- Every number on screen carries its unit and, where it matters, its resolution.
- Keyboard reaches everything: view switches, scrubber, site selection, plate
  dismissal.
- Reduced motion is honoured — the shade animation becomes a cross-fade.
- Light and dark are both first-class. Neither is an afterthought skin.
