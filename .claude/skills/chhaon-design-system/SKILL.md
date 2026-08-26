---
name: chhaon-design-system
description: The locked visual identity for Chhaon — palette, type, motion, layout, and component specs. Load before writing or changing ANY user-facing UI in this repo. Overrides frontend-design wherever the two disagree.
---

# Chhaon Design System

This file pins the visual direction. `frontend-design` teaches how to make design
decisions; this file states the decisions that are already made. **Where they
disagree, this file wins** — `frontend-design` itself says the brief's own words
always win, and this is the brief.

Do not restyle, re-palette, or re-typeset anything here without being asked to.

---

## The thesis

**Green is scarce. Heat is everywhere.**

The palette argues the product's case before a word is read. The interface is
dominated by heat; canopy green appears only where shade actually exists or
where we are recommending it be planted. If a screen looks green and pleasant,
it is lying about Lahore and it is wrong.

## The world we are borrowing from

Survey of Pakistan map sheets. Forest department planting registers. Thermal
camera plates. Manila folders, printed rules, stamped ink, marginalia.

Chhaon is an **instrument**, not a dashboard. It reads as something a city
department printed and has been annotating for years — not as a SaaS product and
not as a hackathon demo.

## Three looks that are forbidden

These are the current AI-design clichés. We land on none of them:

1. **Cream + high-contrast serif display + terracotta.** We are paper-based, but
   there is no serif anywhere in this product and no terracotta accent.
2. **Near-black + one bright acid-green accent.** Our green is a deep forestry
   ink green, never neon, and light is our primary theme.
3. **Broadsheet hairlines + zero radius + dense newspaper columns.** We have
   rules, but we are map-first and spatial, not column-based. Radius is 2px —
   the edge of a pasted label, not a sharp cut.

Also banned outright: gradient blobs, glowing orbs, glassmorphism, fake 3D,
stock sparkle icons, everything-centred, purple-to-blue founder gradients.

---

## Colour

**Light is the primary theme.** Dark is a real, fully-designed second theme —
not a skin. Every token below is defined in both.

### Light — manila register

```
--plate-0        #EDE7DA   page ground, the register paper
--plate-1        #F6F2E9   raised: rail, site plate, scrubber
--plate-2        #E2DACA   inset, hover, pressed
--hairline       #C9BFA9   rules, borders, ticks
--hairline-firm  #A8997C   emphasised rules, active borders

--ink-0          #1F1B14   primary text — printing ink, never pure black
--ink-1          #5A5142   secondary text, labels
--ink-2          #6F6552   captions, units, disabled

--canopy         #1D5C3A   THE accent. Forestry stamp green.
--canopy-fill    #2E8B57   map fills only, where small marks must read
```

### Dark — dusk haze

```
--plate-0        #16110E   warm near-black. Never #000.
--plate-1        #1E1815
--plate-2        #292120
--hairline       #3A2F2B
--hairline-firm  #574943

--ink-0          #F5EFE8   warm bone
--ink-1          #B8AAA0
--ink-2          #8E8079

--canopy         #4FA96E
--canopy-fill    #5FBF7E
```

### The thermal ramp

Six stops, sequential, monotonic in lightness — so it survives greyscale
printing and every form of colour blindness. **Never use a rainbow / jet ramp.**

On paper, **more ink means more heat**. This is the print convention and it is
why the heat layer reads as a thermal plate rather than a web chart.

```
Light  --heat-1 #CFD9D7  --heat-2 #DCC79A  --heat-3 #D69A5C
       --heat-4 #C26A38  --heat-5 #9E3626  --heat-6 #5F1218

Dark   --heat-1 #35404A  --heat-2 #6B4A46  --heat-3 #9E4A32
       --heat-4 #C86A2A  --heat-5 #E89A3C  --heat-6 #FFD166
```

In dark, the ramp inverts to light-is-hot — the thermal-camera convention.

The cool end is deliberately grey-blue, never sage, so it can never be misread
as canopy.

### Rules of use

- Canopy green appears **only** on: existing canopy, recommended planting sites,
  and species information. Nowhere else. Not on buttons. Not on success states.
- The heat ramp appears **only** on data. Never on chrome.
- Population uses ink at varying opacity, never its own hue. A third colour
  scale would turn the map to mud.
- Selection is marked by a **canopy-green hairline ring plus a lift**, never a
  fill colour change.

---

## Type

Three faces, each with one job. All from Google Fonts.

```
Display   Archivo         variable, use the Expanded width axis
Body/UI   IBM Plex Sans   400 / 500 / 600
Data      IBM Plex Mono   400 / 500
Urdu      Noto Nastaliq Urdu
```

**Archivo Expanded** carries plate titles and the loss figures — wide and
authoritative, like a nameplate stamped on a department door. Use it heavy, wide,
and rarely.

**IBM Plex Sans** is the reading and interface face. It was drawn for technical
documentation and it looks like an instrument, not a startup.

**IBM Plex Mono** carries every number that has a unit: coordinates, degrees,
years, scores, resolutions, legend ticks, feature counts. **Any figure a planner
might write down goes in mono.** This single rule does most of the work of making
the product feel measured.

### The Urdu is real typography, not decoration

چھاؤں is set in Noto Nastaliq Urdu at genuine size in the wordmark, and marks
each of the six screens. It is given proper line-height (Nastaliq needs roughly
2x Latin leading) and never squashed, never faux-italicised, never rendered as
an image. It is the one aesthetic risk in this system and it is justified: the
product is named in Urdu, built for Lahore, and the Urdu deserves to be set
properly rather than pasted on.

### Scale

```
plate-title   Archivo Expanded 700   clamp(2.5rem, 5vw, 4.5rem)  tracking -0.03em
figure        Archivo Expanded 700   clamp(2rem, 4vw, 3.25rem)   tracking -0.02em
heading       IBM Plex Sans 600      1.375rem                    tracking -0.01em
subhead       IBM Plex Sans 600      1.0625rem
body          IBM Plex Sans 400      0.9375rem   line-height 1.6
label         IBM Plex Sans 500      0.75rem     tracking 0.08em  UPPERCASE
data          IBM Plex Mono 500      0.8125rem   tracking 0.01em
unit          IBM Plex Mono 400      0.6875rem   colour ink-2
```

Units are always set separately from their figure, in `unit`, in `ink-2`. The
number is the message; the unit is the footnote.

---

## Space, rule, radius

- Base unit **4px**. Every dimension is a multiple.
- Radius **2px** on plates and controls. **0** on rules and map chrome. Never
  more than 2px anywhere in this product.
- Rules are **1px** `--hairline`, or `--hairline-firm` when they separate two
  interactive regions.
- Shadow is used **once**: to lift the site plate off the map. Everywhere else,
  separation is a rule.
  `0 2px 8px rgb(31 27 20 / 0.10), 0 12px 32px rgb(31 27 20 / 0.14)`

---

## Motion

```
--ease-instrument  cubic-bezier(0.2, 0, 0, 1)     default: fast out, long settle
--ease-shade       cubic-bezier(0.4, 0, 0.2, 1)   the shade animation only
--dur-tick         120ms   hover, focus, press
--dur-move         220ms   panel open, plate in
--dur-view         420ms   data layer cross-fade
--dur-shade        900ms   one year of shade retreat
--stagger          40ms
```

Motion serves the instrument. It confirms a state change and it animates the
shade. It never decorates. No parallax, no scroll-jacking, no entrance
animations on static content.

**Reduced motion:** the shade retreat becomes a cross-fade at `--dur-view`, the
camera cuts instead of flying, and every stagger collapses to zero. The product
must remain fully usable and still make its argument.

### The signature: retreating shade

Where canopy exists, the map renders a soft offset shade polygon beneath the
tree mass — real shade, cast to one side, with the sun's angle taken from the
site's latitude. Scrub the year backwards and **shade physically retreats across
the city**.

This is the one thing people will remember. It is the product's whole argument
made literal. Protect it: if something must be cut for time, this is the last
thing to go.

---

## Layout

The map is full-bleed and permanent. Everything else sits on it.

```
Instrument rail   left,   264px  (72px collapsed, icons only, below 1100px)
Thermal scale     right,  56px   vertical, always visible when a data layer is on
Year scrubber     bottom, 88px   full width between rail and scale
Site plate        inset over the map, max 380px, anchored toward its site
```

The map never gets a border. It runs under the chrome and off every edge — the
city does not stop at the panel.

---

## Components

**Instrument rail.** `--plate-1`, single `--hairline-firm` rule on its right
edge, no shadow. Four view switches stacked, region switch below, live readout
pinned to the bottom. The readout — feature count, year range, native resolution
— is in `data` mono and updates with the view. It is what makes this read as an
instrument, so it is never hidden.

**View switch.** Full-width row, `label` type. Active state: `--plate-2` ground,
a 2px `--canopy` bar on the leading edge, `--ink-0` text. Inactive: transparent,
`--ink-1`. Hover lifts to `--plate-2` only.

**Thermal scale.** A vertical bar of the six ramp stops, unlabelled except at the
ends, with mono tick values. Reads as a thermal camera readout. When the active
layer is not heat, it swaps to that layer's scale — same geometry, so nothing
shifts.

**Site plate.** `--plate-1`, 2px radius, the one shadow, a 2px `--canopy` bar
along its top edge. Content in the order set by `docs/SCREENS.md`. The score
breakdown shows each weighted term as a mono row with a hairline bar — the
formula is visible, not hidden behind a single number.

**Year scrubber.** A horizontal rule with ticks only at years we hold imagery
for. The handle is a mono year label in a `--plate-1` chip. Gaps between
available years are visibly wider — the interface never pretends to data it
does not have.

**Species chip.** `--canopy` hairline ring, transparent ground, botanical name in
`body` italic beneath the common name in `subhead`. The only place other than
the map where canopy green appears.

---

## Quality floor — non-negotiable

- Responsive to 375px. The rail collapses; the map never does.
- Visible keyboard focus on every interactive element: 2px `--canopy` outline,
  2px offset. Never `outline: none`.
- Every interactive target at least 44px in its smallest dimension.
- Text contrast at least 4.5:1 in both themes. Verify, do not assume.
- Map colours are checked for deuteranopia and protanopia before shipping.
- Every number carries its unit; every data layer states its native resolution.
- Both themes ship complete. `prefers-color-scheme` is honoured, and an explicit
  toggle overrides it in both directions.
