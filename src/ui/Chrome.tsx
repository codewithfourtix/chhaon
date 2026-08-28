import { useEffect } from 'react'
import { REGIONS, SOURCE_RES, UNIT, VIEWS } from '../data/regions'
import { domainFor } from '../data/load'
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
  const { grid } = useRegionData(region)

  // Exactly the domain the map is drawing with — same function, same numbers.
  let ends: [string, string] = ['—', '—']
  if (grid) {
    const [lo, hi] = domainFor(grid, view, year)
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

/** Year scrubber plus the live readout, in the space the bottom bar already had. */
export function BottomBar() {
  const year = useApp((s) => s.year)
  const setYear = useApp((s) => s.setYear)
  const region = useApp((s) => s.region)
  const view = useApp((s) => s.view)
  const { grid, sites, meta, loading } = useRegionData(region)

  const years = grid?.years ?? []

  // Default to the most recent year the data actually has.
  useEffect(() => {
    if (years.length && (year === null || !years.includes(year))) {
      setYear(years[years.length - 1])
    }
  }, [years, year, setYear])

  const first = years[0]
  const last = years[years.length - 1]
  const span = Math.max(1, (last ?? 1) - (first ?? 0))
  const rm = meta?.regions?.[region]

  return (
    <div className="bottombar">
      <div className="bottombar__scrub">
        {years.length ? (
          <>
            <div className="scrubber__label">
              <span className="t-label">Year</span>
              <span className="t-figure scrubber__year">{year ?? last}</span>
            </div>

            <div className="scrubber__track">
              <span className="scrubber__rule" aria-hidden="true" />
              {/* Ticks sit at true temporal positions, so a year with no usable
                  imagery reads as a real gap rather than being quietly skipped. */}
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={`scrubber__tick ${y === year ? 'is-active' : ''}`}
                  style={{ left: `${((y - first) / span) * 100}%` }}
                  aria-label={`Show ${y}`}
                  aria-current={y === year}
                  onClick={() => setYear(y)}
                >
                  <span className="t-unit scrubber__tickyear">{y}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <span className="t-label">Loading imagery&hellip;</span>
        )}
      </div>

      <dl className="stats" aria-label="Current readout">
        <div className="stats__item">
          <dt className="t-label">Sites</dt>
          <dd className="t-data">{loading ? '—' : (sites?.features.length ?? 0)}</dd>
        </div>
        <div className="stats__item">
          <dt className="t-label">Years</dt>
          <dd className="t-data">{years.length ? `${first}–${last}` : '—'}</dd>
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
  if (error) {
    return (
      <div className="databar databar--error">
        <span className="t-data">Data failed to load: {error}</span>
      </div>
    )
  }
  return loading ? <div className="databar" aria-hidden="true" /> : null
}
