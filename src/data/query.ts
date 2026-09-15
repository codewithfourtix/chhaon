import { REGIONS, VIEWS } from './regions'
import type { RegionId, ViewId } from './types'
import type { LandUse } from '../state/store'

/**
 * Plain language that sets the map, rather than a chatbot.
 *
 * "show worst hit areas in johar town since 2018" moves the region, the view and
 * the year. It does not answer in prose, and that is the entire design: a model
 * writing sentences about this data would eventually state a number nobody
 * measured, and every figure in this product is traceable to a named satellite
 * scene. A parser that can only *select* — from the five regions, five views, the
 * years the pipeline actually produced, the species that appear in the ranking —
 * has no mechanism for inventing anything.
 *
 * So this is a deterministic phrase matcher, with no model and no network. The
 * consequences are all in its favour here:
 *
 *   - **It cannot hallucinate.** Every output is an existing piece of app state.
 *   - **It is auditable.** It reports what it matched and what it ignored, so the
 *     user can see it was understood rather than guessed at.
 *   - **Urdu costs almost nothing.** Setting a filter needs recognition, not
 *     generation, so Urdu is a synonym table rather than a second language model.
 *   - **It works offline**, which the rest of the product also does.
 *
 * When it understands nothing it says so. Silently doing nothing would be the one
 * genuinely bad outcome — the user cannot tell that from a broken feature.
 */

export interface QueryResult {
  region?: RegionId
  view?: ViewId
  year?: number
  landuse?: LandUse[]
  species?: string
  minPeople?: number
  theme?: 'light' | 'dark'
  basemap?: 'map' | 'satellite'
  open?: 'alerts' | 'reports' | 'cost' | 'air'
  clearFilters?: boolean
  /** What it understood, for display. The user must be able to check it. */
  matched: { label: string; value: string }[]
  /** Caveats about what the app will actually do with this. */
  notes: string[]
  /** Words it could not use — shown so nothing is silently dropped. */
  ignored: string[]
}

/* -------------------------------------------------------------------------- */

/** Region synonyms, including Urdu and the spellings people actually type. */
const REGION_WORDS: Record<RegionId, string[]> = {
  'model-town': ['model town', 'modeltown', 'model', 'ماڈل ٹاؤن', 'ماڈل'],
  gulberg: ['gulberg', 'gulburg', 'گلبرگ'],
  dha: ['dha', 'defence', 'defence housing', 'ڈی ایچ اے', 'ڈیفنس'],
  'johar-town': ['johar town', 'johartown', 'johar', 'جوہر ٹاؤن', 'جوہر'],
  'iqbal-town': ['iqbal town', 'iqbaltown', 'iqbal', 'اقبال ٹاؤن', 'اقبال'],
}

const VIEW_WORDS: Record<ViewId, string[]> = {
  canopy: [
    'canopy', 'green cover', 'greenery', 'green', 'vegetation', 'ndvi', 'trees',
    'tree cover', 'سبزہ', 'درخت', 'ہریالی',
  ],
  heat: [
    'heat', 'hot', 'hottest', 'temperature', 'surface temperature', 'lst',
    'warmest', 'گرمی', 'درجہ حرارت', 'گرم',
  ],
  people: ['people', 'population', 'density', 'crowded', 'آبادی', 'لوگ'],
  risk: [
    'risk', 'risky', 'worst', 'worst hit', 'worst affected', 'most affected',
    'critical', 'vulnerable', 'خطرہ', 'خطرناک', 'بدترین',
  ],
  priority: [
    'priority', 'plant', 'planting', 'where to plant', 'sites', 'ranked',
    'recommendations', 'shortlist', 'لگانا', 'پودے', 'ترجیح',
  ],
}

const LANDUSE_WORDS: Record<LandUse, string[]> = {
  roadside: ['roadside', 'road side', 'verge', 'verges', 'street', 'streets', 'سڑک'],
  park: ['park', 'parks', 'پارک'],
  canal: ['canal', 'canals', 'canal bank', 'نہر'],
  vacant: ['vacant', 'empty', 'empty plot', 'plots', 'خالی'],
}

/** Species in the shipped table. Passed in where possible; this is the fallback. */
const SPECIES_WORDS = [
  'neem', 'amaltas', 'arjun', 'pipal', 'peepal', 'jamun', 'sheesham', 'moringa',
]

const PANEL_WORDS: Record<NonNullable<QueryResult['open']>, string[]> = {
  alerts: [
    'change', 'changed', 'recent', 'recent loss', 'loss', 'felled', 'cut down',
    'alerts', 'watch', 'watched', 'تبدیلی', 'کٹائی',
  ],
  reports: ['reports', 'report', 'citizen', 'citizen reports', 'شکایت', 'رپورٹ'],
  cost: ['cost', 'budget', 'price', 'how much', 'لاگت', 'بجٹ'],
  air: ['air', 'air quality', 'pm2.5', 'pm25', 'particulate', 'smog', 'ہوا', 'سموگ'],
}

const THEME_WORDS = {
  dark: ['dark', 'dark mode', 'night', 'رات'],
  light: ['light', 'light mode', 'day', 'دن'],
} as const

const BASEMAP_WORDS = {
  satellite: ['satellite', 'imagery', 'aerial', 'photo', 'سیٹلائٹ'],
  map: ['map view', 'basemap', 'survey', 'plain map', 'نقشہ'],
} as const

/** Words that carry no instruction; not worth reporting as ignored. */
const FILLER = new Set([
  'show', 'me', 'the', 'a', 'an', 'in', 'of', 'at', 'on', 'for', 'to', 'and',
  'with', 'areas', 'area', 'where', 'what', 'which', 'is', 'are', 'was', 'were',
  'please', 'give', 'find', 'display', 'go', 'open', 'view', 'all', 'most',
  'دکھاؤ', 'میں', 'کا', 'کی', 'کے', 'ہے', 'اور',
])

/**
 * Normalise for matching. Urdu is left alone beyond whitespace collapsing —
 * lowercasing does nothing for it and stripping marks would break the synonyms.
 */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[?!.,;:"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Find the longest matching phrase first, so "model town" beats "model" and
 * "worst hit" beats "worst". Returns the matched phrase, or null.
 */
function findPhrase(haystack: string, phrases: readonly string[]): string | null {
  const sorted = [...phrases].sort((a, b) => b.length - a.length)
  for (const p of sorted) {
    // Word-boundary match for Latin script; plain inclusion for Urdu, which does
    // not use spaces the same way and has no \b semantics here.
    const isLatin = /^[a-z0-9 .]+$/.test(p)
    if (isLatin) {
      // Tolerate a plural: people type "roadsides" and "parks", and a matcher
      // that only knows the singular silently drops the filter — which looks
      // exactly like the feature not working.
      const re = new RegExp(
        `(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?(\\s|$)`
      )
      const hit = haystack.match(re)
      if (hit) return hit[0].trim()
    } else if (haystack.includes(p)) {
      return p
    }
  }
  return null
}

export interface ParseOptions {
  /** Years the pipeline actually produced for the region in view. */
  years?: number[]
  /** Species present in the current ranking, so it can only pick real ones. */
  species?: string[]
}

export function parseQuery(input: string, opts: ParseOptions = {}): QueryResult {
  const out: QueryResult = { matched: [], notes: [], ignored: [] }
  if (!norm(input)) return out

  /**
   * The working string, with each matched phrase removed as it is consumed.
   *
   * Order matters, and it runs most-specific first. "serving more than 5000
   * people" has to be eaten by the threshold rule BEFORE the view rule looks at
   * the sentence, or the trailing "people" selects the Population view and the
   * user's request for ranked sites quietly becomes something else. That is the
   * kind of bug a phrase matcher is supposed to be immune to, and it is only
   * avoided by consuming as you go.
   */
  let q = norm(input)
  const take = (phrase: string | null) => {
    if (phrase) q = q.split(phrase).join(' ').replace(/\s+/g, ' ').trim()
    return phrase
  }

  // --- people served (first: it contains the word "people") ---
  // Requires an explicit number; never inferred from "crowded".
  const people = q.match(
    /(?:more than|over|at least|above|>|serving)\s*([\d,]+)\s*(?:people|persons)?/
  )
  if (people) {
    const n = Number(people[1].replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0) {
      out.minPeople = n
      out.matched.push({ label: 'People served', value: `≥ ${n.toLocaleString()}` })
      take(people[0])
    }
  }

  // --- region ---
  for (const r of REGIONS) {
    if (take(findPhrase(q, REGION_WORDS[r.id]))) {
      out.region = r.id
      out.matched.push({ label: 'Region', value: r.name })
      break
    }
  }

  // --- land use, before views: "street" and "park" are land use here ---
  const landuse: LandUse[] = []
  for (const lu of Object.keys(LANDUSE_WORDS) as LandUse[]) {
    if (take(findPhrase(q, LANDUSE_WORDS[lu]))) landuse.push(lu)
  }
  if (landuse.length) {
    out.landuse = landuse
    out.matched.push({ label: 'Land use', value: landuse.join(', ') })
  }

  // --- species ---
  const available = opts.species?.length ? opts.species : null
  const pool = available ? available.map((s) => s.toLowerCase()) : SPECIES_WORDS
  const sp = take(findPhrase(q, pool))
  if (sp) {
    // Give back the properly-cased name from the data where we have it.
    const real = available?.find((s) => s.toLowerCase() === sp)
    const value = real ?? sp.replace(/^./, (c) => c.toUpperCase())
    out.species = value
    out.matched.push({ label: 'Species', value })
  }

  // --- view ---
  for (const v of VIEWS) {
    if (take(findPhrase(q, VIEW_WORDS[v.id]))) {
      out.view = v.id
      out.matched.push({ label: 'View', value: v.name })
      break
    }
  }

  // --- year ---
  // Only years the pipeline produced. "since 2018" and "in 2018" both land on
  // 2018; there is one year on screen at a time, so a range would be a promise
  // the scrubber cannot keep.
  const yearMatch = q.match(/\b(19|20)\d{2}\b/)
  if (yearMatch) {
    const y = Number(yearMatch[0])
    take(yearMatch[0])
    const years = opts.years ?? []
    if (!years.length || years.includes(y)) {
      out.year = y
      out.matched.push({ label: 'Year', value: String(y) })
      if (/\bsince\b|\bfrom\b|\bafter\b/.test(q)) {
        out.notes.push(
          `Showing ${y} itself — the map holds one year at a time, so "since" sets the starting year rather than a range.`
        )
      }
    } else {
      // Never silently snap to a different year: that would show one measurement
      // while the user believes they asked for another.
      const nearest = years.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a))
      out.notes.push(
        `No usable imagery for ${y} — the pipeline dropped it. Closest available is ${nearest}.`
      )
    }
  }

  // --- panels ---
  for (const key of Object.keys(PANEL_WORDS) as NonNullable<QueryResult['open']>[]) {
    if (take(findPhrase(q, PANEL_WORDS[key]))) {
      out.open = key
      out.matched.push({ label: 'Panel', value: key })
      break
    }
  }

  // --- theme and basemap ---
  for (const t of ['dark', 'light'] as const) {
    if (take(findPhrase(q, THEME_WORDS[t]))) {
      out.theme = t
      out.matched.push({ label: 'Theme', value: t })
      break
    }
  }
  for (const b of ['satellite', 'map'] as const) {
    if (take(findPhrase(q, BASEMAP_WORDS[b]))) {
      out.basemap = b
      out.matched.push({ label: 'Basemap', value: b })
      break
    }
  }

  // --- clear ---
  if (take(findPhrase(q, ['clear', 'reset', 'clear filters', 'everything', 'سب']))) {
    out.clearFilters = true
    out.matched.push({ label: 'Filters', value: 'cleared' })
  }

  // --- what was not used ---
  // Whatever is left after every rule has taken its phrase. Reported so the user
  // can see the difference between "understood and applied" and "quietly dropped
  // on the floor".
  out.ignored = q.split(/\s+/).filter((w) => w && !FILLER.has(w) && !/^\d+$/.test(w))

  // A view that ignores the year should say so rather than letting the user
  // believe the scrubber did something.
  if (out.year !== undefined && out.view && out.view !== 'canopy') {
    out.notes.push(
      `${VIEWS.find((v) => v.id === out.view)?.name} is a single-date measurement, so the year applies to Canopy only.`
    )
  }

  return out
}

/** Did the query express anything actionable? */
export const isEmpty = (r: QueryResult) => r.matched.length === 0

/** Examples worth putting in front of someone who has never used the box. */
export const QUERY_EXAMPLES = [
  'worst hit areas in johar town',
  'green cover in model town 2018',
  'neem sites on roadsides serving more than 5000 people',
  'recent loss in gulberg',
  'گلبرگ میں گرمی',
]
