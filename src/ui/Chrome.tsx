import { useEffect, useState } from 'react'
import { REGIONS, SOURCE_RES, UNIT, VIEWS } from '../data/regions'
import { activePeriod, domainFor, ndviPending, useNdviYears } from '../data/load'
import { loadMonthly, monthLabel, usableMonths, type MonthlyDoc } from '../data/monthly'
import {
  captureLabel, imageryFor, loadImagery, sensorName, type ImageryDoc,
} from '../data/imagery'
import { RISK_BANDS, riskFor } from '../data/risk'
import { useRegionData } from '../data/useRegionData'
import { useApp } from '../state/store'
import type { ViewId } from '../data/types'
import {
  IconCanopy, IconHeat, IconMethod, IconPeople, IconPriority, IconRegion,
  IconRisk, IconTheme,
} from './icons'

const HEAT_RAMP = ['--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5', '--heat-6']
const CANOPY_RAMP = ['--canopy-1', '--canopy-2', '--canopy-3', '--canopy-4', '--canopy-5', '--canopy-6']

const VIEW_ICON: Record<ViewId, () => React.ReactElement> = {
  canopy: IconCanopy,
  heat: IconHeat,
  people: IconPeople,
  risk: IconRisk,
  priority: IconPriority,
}

/**
 * The rail is nav only.
 *
 * It used to also carry a four-row statistics block pinned to the bottom. On a
 * normal laptop window that block overlapped the Region section and clipped the
 * buttons under it — the sidebar simply could not hold everything. The readout
 * now lives in the bottom bar, where there was already empty space.
 */
export function InstrumentRail() {
  const view = useApp((s) => s.view)
  const region = useApp((s) => s.region)
  const setView = useApp((s) => s.setView)
  const setRegion = useApp((s) => s.setRegion)
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const showMethodology = useApp((s) => s.showMethodology)

  return (
    <nav className="rail" aria-label="Map controls">
      <header className="rail__head">
        <span className="rail__mark t-urdu" lang="ur" dir="rtl">چھاؤں</span>
        <span className="rail__name">Chhaon</span>
      </header>

      <div className="rail__nav">
        <h2 className="rail__legend">View</h2>
        {VIEWS.map((v) => {
          const Icon = VIEW_ICON[v.id]
          return (
            <button
              key={v.id}
              type="button"
              className={`nav ${view === v.id ? 'is-active' : ''}`}
              aria-current={view === v.id}
              // The collapsed rail hides the text with display:none, which also
              // removes it from the accessibility tree — below 1100 px these were
              // five unnamed buttons. The label keeps a name when the text goes.
              aria-label={v.name}
              title={v.name}
              onClick={() => setView(v.id)}
            >
              <span className="nav__icon"><Icon /></span>
              <span className="nav__text">
                <span className="nav__name">{v.name}</span>
                <span className="nav__blurb">{v.blurb}</span>
              </span>
            </button>
          )
        })}

        <h2 className="rail__legend rail__legend--spaced">Region</h2>
        {REGIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`nav nav--tight ${region === r.id ? 'is-active' : ''}`}
            aria-current={region === r.id}
            aria-label={r.name}
            title={r.name}
            onClick={() => setRegion(r.id)}
          >
            <span className="nav__icon"><IconRegion /></span>
            <span className="nav__text"><span className="nav__name">{r.name}</span></span>
          </button>
        ))}
      </div>

      <footer className="rail__foot">
        <button type="button" className="footBtn" onClick={showMethodology}>
          <IconMethod />
          <span>Method</span>
        </button>
        <button
          type="button"
          className="footBtn"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
          <IconTheme />
          <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
        </button>
      </footer>
    </nav>
  )
}

/**
 * Sits on the map rather than in the rail — in the rail it fell below the fold
 * and was covered by the pinned footer.
 */
export function BasemapToggle() {
  const basemap = useApp((s) => s.basemap)
  const setBasemap = useApp((s) => s.setBasemap)

  return (
    <div className="segmented" role="group" aria-label="Basemap">
      {([{ id: 'map', name: 'Map' }, { id: 'satellite', name: 'Satellite' }] as const).map((b) => (
        <button
          key={b.id}
          type="button"
          className={`segmented__btn ${basemap === b.id ? 'is-active' : ''}`}
          aria-pressed={basemap === b.id}
          onClick={() => setBasemap(b.id)}
        >
          {b.name}
        </button>
      ))}
    </div>
  )
}

export function ThermalScale() {
  const view = useApp((s) => s.view)
  const region = useApp((s) => s.region)
  const year = useApp((s) => s.year)
  const cadence = useApp((s) => s.cadence)
  const month = useApp((s) => s.month)
  const { grid, sites } = useRegionData(region)
  // The canopy domain is read from the year's own values, so the legend has to
  // recompute when a year arrives — otherwise it keeps the fallback range.
  useNdviYears()

  // Exactly the domain the map is drawing with — same function, same numbers.
  // Priority's domain comes from the ranking rather than the grid, so the scores
  // have to be handed over here too; without them this printed a placeholder
  // while the map painted the real range.
  let ends: [string, string] = ['—', '—']
  if (grid) {
    const [lo, hi] = domainFor(grid, view, activePeriod(cadence, year, month),
      sites?.features.map((f) => f.properties.score))
    const dp = view === 'canopy' || view === 'priority' ? 2 : 0
    ends = [lo.toFixed(dp), hi.toFixed(dp)]
  }

  // Risk is a classification, so its legend names the bands rather than
  // showing a numeric range nobody would quote.
  if (view === 'risk') {
    return (
      <aside className="scale scale--risk" aria-label="Legend, risk band">
        <span className="scale__unit">Risk</span>
        <ul className="riskKey">
          {[...RISK_BANDS].reverse().map((band) => (
            <li key={band}>
              <span
                className="riskKey__swatch"
                style={{ background: `var(--risk-${RISK_BANDS.indexOf(band) + 1})` }}
              />
              <span className="riskKey__label">{band}</span>
            </li>
          ))}
        </ul>
        <span className="t-unit scale__res">{SOURCE_RES[view]}</span>
      </aside>
    )
  }

  const ramp = view === 'canopy' ? CANOPY_RAMP : HEAT_RAMP

  return (
    <aside className="scale" aria-label={`Legend, ${UNIT[view]}`}>
      <span className="scale__unit">{UNIT[view]}</span>
      <div className="scale__bar">
        {ramp.map((token, i) => (
          <span
            key={token}
            className="scale__stop"
            style={{
              background: `var(${view === 'people' ? '--ink-0' : token})`,
              opacity: view === 'people' ? 0.07 + i * 0.158 : 1,
            }}
          />
        ))}
        <span className="t-data scale__tick scale__tick--hi">{ends[1]}</span>
        <span className="t-data scale__tick scale__tick--lo">{ends[0]}</span>
      </div>
      <span className="t-unit scale__res">{SOURCE_RES[view]}</span>
    </aside>
  )
}

/**
 * The scrubber and the live readout.
 *
 * Two cadences, switched rather than merged. The yearly track walks the
 * season-locked annual composites; the monthly track walks calendar months over
 * the recent two years. They are deliberately not one timeline: the annual window
 * is locked to one spring precisely so that a spring reading and a September
 * reading are never treated as neighbouring points, and joining them here would
 * throw that away in the one place a user would trust it most.
 */
export function BottomBar() {
  const year = useApp((s) => s.year)
  const setYear = useApp((s) => s.setYear)
  const cadence = useApp((s) => s.cadence)
  const setCadence = useApp((s) => s.setCadence)
  const month = useApp((s) => s.month)
  const setMonth = useApp((s) => s.setMonth)
  const region = useApp((s) => s.region)
  const view = useApp((s) => s.view)
  const basemap = useApp((s) => s.basemap)
  const { grid, sites, meta, loading } = useRegionData(region)

  const [imagery, setImagery] = useState<ImageryDoc | null>(null)
  useEffect(() => {
    loadImagery().then(setImagery)
  }, [])

  const [monthly, setMonthly] = useState<MonthlyDoc | null>(null)
  useEffect(() => {
    let live = true
    loadMonthly(region).then((d) => {
      if (live) setMonthly(d)
    })
    return () => {
      live = false
    }
  }, [region])

  const years = grid?.years ?? []
  const months = usableMonths(monthly)

  // Default to the most recent year the data actually has.
  useEffect(() => {
    if (years.length && (year === null || !years.includes(year))) {
      setYear(years[years.length - 1])
    }
  }, [years, year, setYear])

  // Same for the month, and re-derived when the region changes: the month list is
  // per region, so one region's September may not exist in another's.
  useEffect(() => {
    if (!months.length) return
    if (month === null || !months.some((p) => p.period === month)) {
      setMonth(months[months.length - 1].period)
    }
  }, [months, month, setMonth])

  const first = years[0]
  const last = years[years.length - 1]
  const span = Math.max(1, (last ?? 1) - (first ?? 0))
  const rm = meta?.regions?.[region]

  // Every month in the window, usable or not, so the track can show the gaps
  // where they fall. An unexplained hole looks like a bug; a labelled one is the
  // finding that Lahore is unreadable from orbit for a third of the year.
  const allMonths = monthly?.periods ?? []
  const monthAt = (period: string) =>
    allMonths.length > 1
      ? (allMonths.findIndex((p) => p.period === period) / (allMonths.length - 1)) * 100
      : 0

  // Each tick's hit area, capped at the distance to its neighbour. At a fixed 40 px
  // the ticks overlapped on any laptop-width window — 9 years in a 191 px track sit
  // 24 px apart — so a click on 2020 landed on 2021, which sits later in the DOM
  // and on top. Capped this way two ticks cannot overlap however narrow the track
  // gets; the % is of the track, which is the ticks' containing block.
  const yearHit = `min(40px, ${100 / span}%)`
  const monthHit = `min(40px, ${100 / Math.max(1, allMonths.length - 1)}%)`

  return (
    <div className="bottombar">
      <div className="bottombar__scrub">
        {years.length ? (
          <>
            <div className="scrubber__label">
              {/* Only offered when the monthly stage has actually been run for
                  this region. A toggle that leads nowhere is worse than none. */}
              {months.length > 1 ? (
                <div className="cadence" role="group" aria-label="Cadence">
                  {(['yearly', 'monthly'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`cadence__btn ${cadence === c ? 'is-active' : ''}`}
                      aria-pressed={cadence === c}
                      title={
                        c === 'yearly'
                          ? 'One season-locked reading a year, for comparing years'
                          : 'Calendar months over the recent two years, for the season'
                      }
                      onClick={() => setCadence(c)}
                    >
                      {c === 'yearly' ? 'Yearly' : 'Monthly'}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="t-label">Year</span>
              )}
              <span className="t-figure scrubber__year">
                {cadence === 'monthly'
                  ? monthLabel(month ?? months[months.length - 1]?.period ?? '')
                  : (year ?? last)}
              </span>
            </div>

            <div className="scrubber__track">
              <span className="scrubber__rule" aria-hidden="true" />
              {/* Ticks sit at true temporal positions, so a period with no usable
                  imagery reads as a real gap rather than being quietly skipped. */}
              {cadence === 'yearly'
                ? years.map((y) => (
                    <button
                      key={y}
                      type="button"
                      className={`scrubber__tick ${y === year ? 'is-active' : ''}`}
                      style={{ left: `${((y - first) / span) * 100}%`, width: yearHit }}
                      aria-label={`Show ${y}`}
                      aria-current={y === year}
                      onClick={() => setYear(y)}
                    >
                      <span className="t-unit scrubber__tickyear">{y}</span>
                    </button>
                  ))
                : allMonths.map((p) =>
                    p.usable ? (
                      <button
                        key={p.period}
                        type="button"
                        className={`scrubber__tick ${p.period === month ? 'is-active' : ''}`}
                        style={{ left: `${monthAt(p.period)}%`, width: monthHit }}
                        aria-label={`Show ${monthLabel(p.period)}, ${p.vegPct}% vegetated`}
                        aria-current={p.period === month}
                        title={`${monthLabel(p.period)} · ${p.vegPct}% vegetated · ${p.scenes} scenes`}
                        onClick={() => setMonth(p.period)}
                      >
                        <span className="t-unit scrubber__tickyear">
                          {p.period.slice(5, 7)}
                        </span>
                      </button>
                    ) : (
                      // Not a button: there is nothing to show. Present, faint and
                      // titled, so the gap carries its own explanation.
                      <span
                        key={p.period}
                        className="scrubber__gap"
                        style={{ left: `${monthAt(p.period)}%` }}
                        title={`${monthLabel(p.period)} — ${p.reason}`}
                        aria-hidden="true"
                      />
                    )
                  )}
            </div>
          </>
        ) : (
          <span className="t-label">Loading imagery&hellip;</span>
        )}
      </div>

      <dl className="stats" aria-label="Current readout">
        <ImageryStat
          doc={basemap === 'satellite' ? imagery : null}
          region={region}
          period={
            cadence === 'monthly'
              ? month
              : year === null ? null : String(year)
          }
        />
        <div className="stats__item">
          <dt className="t-label">Sites</dt>
          <dd className="t-data">{loading ? '—' : (sites?.features.length ?? 0)}</dd>
        </div>
        <div className="stats__item">
          <dt className="t-label">{cadence === 'monthly' ? 'Months' : 'Years'}</dt>
          <dd className="t-data">
            {cadence === 'monthly'
              ? months.length
                ? `${months.length} of ${allMonths.length}`
                : '—'
              : years.length
                ? `${first}–${last}`
                : '—'}
          </dd>
        </div>
        <div className="stats__item">
          <dt className="t-label">Source</dt>
          <dd className="t-data">{SOURCE_RES[view]}</dd>
        </div>
        <div className="stats__item">
          <dt className="t-label">Baseline</dt>
          <dd className="t-data">{grid ? `${grid.baselineC.toFixed(1)}°C` : '—'}</dd>
        </div>
        {grid && (
          <div className="stats__item">
            <dt className="t-label">High risk</dt>
            <dd className="t-data">
              {(riskFor(grid).summary.elevated * 100).toFixed(0)}%
            </dd>
          </div>
        )}
        {rm?.heatGapC != null && (
          <div className="stats__item stats__item--accent">
            <dt className="t-label">Shade worth</dt>
            <dd className="t-data">{rm.heatGapC.toFixed(1)}°C</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

/** Shown while region data is in flight — the map stays interactive throughout. */
export function LoadingBar() {
  const loading = useApp((s) => s.dataLoading)
  const error = useApp((s) => s.dataError)
  const region = useApp((s) => s.region)
  const year = useApp((s) => s.year)
  const cadence = useApp((s) => s.cadence)
  const month = useApp((s) => s.month)
  useNdviYears()
  // A year fetched on demand is also "data in flight", and the hairline is the
  // only thing telling the user the scrubber is working rather than stuck.
  const waitingOnYear = ndviPending(region, activePeriod(cadence, year, month))
  if (error) {
    return (
      <div className="databar databar--error">
        <span className="t-data">Data failed to load: {error}</span>
      </div>
    )
  }
  return loading || waitingOnYear ? <div className="databar" aria-hidden="true" /> : null
}

/**
 * Which photograph is under the data, by the date it was actually taken.
 *
 * The answer to "I clicked 2017 and still see today's ground". The imagery now
 * follows the scrubber, but a release is not a capture: Esri's 2019 release shows
 * Model Town as photographed in February 2017. So this states the capture date, and
 * says plainly when no photograph was taken in the period being viewed rather than
 * letting the year on the scrubber imply one was.
 */
function ImageryStat({
  doc,
  region,
  period,
}: {
  doc: ImageryDoc | null
  region: Parameters<typeof imageryFor>[1]
  period: string | null
}) {
  const choice = imageryFor(doc, region, period)
  if (!choice || !period) return null

  const { capture, matchesPeriod } = choice
  const periodLabel = period.includes('-') ? monthLabel(period) : period
  const mixed = capture.matching < capture.samples

  const detail = [
    `Photographed ${captureLabel(capture.captured)} by ${sensorName(capture.source)}`,
    `at ${capture.resM} m`,
    matchesPeriod
      ? ''
      : `— no photograph was taken over this area in ${periodLabel}, so this is the most recent one before it`,
    mixed
      ? `. The date holds at ${capture.matching} of ${capture.samples} points sampled; other parts of the mosaic are from ${capture.otherDates.map(captureLabel).join(', ')}`
      : '',
    `. Esri Wayback release of ${captureLabel(capture.releaseDate)}.`,
  ].join(' ').replace(/\s+([.,—])/g, '$1')

  return (
    <div
      className={`stats__item stats__item--imagery ${matchesPeriod ? '' : 'is-earlier'}`}
      title={detail}
    >
      <dt className="t-label">{matchesPeriod ? 'Imagery' : `Imagery · none in ${periodLabel}`}</dt>
      <dd className="t-data">{captureLabel(capture.captured)}</dd>
    </div>
  )
}
