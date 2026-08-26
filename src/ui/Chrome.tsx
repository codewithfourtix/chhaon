import { useMemo } from 'react'
import { REGIONS, RESOLUTION, UNIT, VIEWS, YEARS } from '../data/regions'
import { PLACEHOLDER_SITES } from '../data/placeholderSites'
import { useApp } from '../state/store'

const RAMP = ['--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5', '--heat-6']

export function InstrumentRail() {
  const view = useApp((s) => s.view)
  const region = useApp((s) => s.region)
  const setView = useApp((s) => s.setView)
  const setRegion = useApp((s) => s.setRegion)
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)

  const count = useMemo(
    () => PLACEHOLDER_SITES.filter((s) => s.region === region).length,
    [region]
  )

  return (
    <nav className="rail" aria-label="Map controls">
      <header className="rail__head">
        <span className="rail__mark t-urdu" lang="ur" dir="rtl">چھاؤں</span>
        <span className="rail__name">Chhaon</span>
      </header>

      <div className="rail__group">
        <h2 className="t-label rail__legend">View</h2>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`switch ${view === v.id ? 'is-active' : ''}`}
            aria-current={view === v.id}
            onClick={() => setView(v.id)}
          >
            <span className="switch__name">{v.name}</span>
            <span className="switch__blurb">{v.blurb}</span>
          </button>
        ))}
      </div>

      <div className="rail__group">
        <h2 className="t-label rail__legend">Region</h2>
        {REGIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`switch switch--tight ${region === r.id ? 'is-active' : ''}`}
            aria-current={region === r.id}
            onClick={() => setRegion(r.id)}
          >
            <span className="switch__name">{r.name}</span>
          </button>
        ))}
      </div>

      {/* The readout is what makes this an instrument. It is never hidden. */}
      <footer className="readout">
        <div className="readout__row">
          <span className="t-label">Sites</span>
          <span className="t-data">{count}</span>
        </div>
        <div className="readout__row">
          <span className="t-label">Years</span>
          <span className="t-data">{YEARS[0]}&ndash;{YEARS[YEARS.length - 1]}</span>
        </div>
        <div className="readout__row">
          <span className="t-label">Resolution</span>
          <span className="t-data">{RESOLUTION[view]}</span>
        </div>
        <button type="button" className="readout__theme t-label" onClick={toggleTheme}>
          {theme === 'light' ? 'Dark' : 'Light'} theme
        </button>
      </footer>
    </nav>
  )
}

export function ThermalScale() {
  const view = useApp((s) => s.view)
  const ends =
    view === 'heat'
      ? ['34', '44']
      : view === 'people'
        ? ['0.4', '5.6k']
        : view === 'canopy'
          ? ['0.1', '0.8']
          : ['0.3', '1.0']

  return (
    <aside className="scale" aria-label={`Legend, ${UNIT[view]}`}>
      <span className="t-label scale__unit">{UNIT[view]}</span>
      <div className="scale__bar">
        {RAMP.map((token, i) => (
          <span
            key={token}
            className="scale__stop"
            style={{ background: `var(${view === 'people' ? '--ink-0' : token})`,
                     opacity: view === 'people' ? 0.15 + i * 0.17 : 1 }}
          />
        ))}
        <span className="t-data scale__tick scale__tick--hi">{ends[1]}</span>
        <span className="t-data scale__tick scale__tick--lo">{ends[0]}</span>
      </div>
      <span className="t-unit scale__res">{RESOLUTION[view]}</span>
    </aside>
  )
}

export function YearScrubber() {
  const year = useApp((s) => s.year)
  const setYear = useApp((s) => s.setYear)
  const span = YEARS[YEARS.length - 1] - YEARS[0]

  return (
    <div className="scrubber">
      <div className="scrubber__label">
        <span className="t-label">Year</span>
        <span className="t-figure scrubber__year">{year}</span>
      </div>

      <div className="scrubber__track">
        <span className="scrubber__rule" aria-hidden="true" />
        {/* Ticks sit at true temporal positions, so gaps in coverage read as gaps. */}
        {YEARS.map((y) => (
          <button
            key={y}
            type="button"
            className={`scrubber__tick ${y === year ? 'is-active' : ''}`}
            style={{ left: `${((y - YEARS[0]) / span) * 100}%` }}
            aria-label={`Show ${y}`}
            aria-current={y === year}
            onClick={() => setYear(y)}
          >
            <span className="t-unit scrubber__tickyear">{y}</span>
          </button>
        ))}
      </div>

      <p className="t-unit scrubber__note">
        Ticks mark years with usable imagery. 2018 is absent — cloud cover.
      </p>
    </div>
  )
}
