import { useEffect } from 'react'
import { LANDUSE_NAME, REGIONS, SOURCE_RES, UNIT, VIEWS } from '../data/regions'
import { domainFor } from '../data/load'
import { useRegionData } from '../data/useRegionData'
import { useApp } from '../state/store'

const HEAT_RAMP = ['--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5', '--heat-6']
const CANOPY_RAMP = ['--canopy-1', '--canopy-2', '--canopy-3', '--canopy-4', '--canopy-5', '--canopy-6']

export function InstrumentRail() {
  const view = useApp((s) => s.view)
  const region = useApp((s) => s.region)
  const setView = useApp((s) => s.setView)
  const setRegion = useApp((s) => s.setRegion)
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const showMethodology = useApp((s) => s.showMethodology)

  const { grid, sites, meta, loading } = useRegionData(region)
  const rmeta = meta?.regions?.[region]

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

      {/* The readout is what makes this an instrument. It is never hidden, and
          every figure in it comes from the scene that was actually used. */}
      <footer className="readout">
        <div className="readout__row">
          <span className="t-label">Sites</span>
          <span className="t-data">{loading ? '—' : (sites?.features.length ?? 0)}</span>
        </div>
        <div className="readout__row">
          <span className="t-label">Years</span>
          <span className="t-data">
            {grid ? `${grid.years[0]}–${grid.years[grid.years.length - 1]}` : '—'}
          </span>
        </div>
        <div className="readout__row">
          <span className="t-label">Source</span>
          <span className="t-data">{SOURCE_RES[view]}</span>
        </div>
        <div className="readout__row">
          <span className="t-label">Baseline</span>
          <span className="t-data">
            {grid ? `${grid.baselineC.toFixed(1)}°C` : '—'}
          </span>
        </div>
        {rmeta && (
          <p className="t-unit readout__scene">
            Heat from {rmeta.lstScene.id.split('_').slice(0, 4).join(' ')},{' '}
            {rmeta.lstScene.datetime}
          </p>
        )}

        <button type="button" className="readout__theme t-label" onClick={showMethodology}>
          Method<span className="readout__themeword">ology</span>
        </button>
        <button type="button" className="readout__theme t-label" onClick={toggleTheme}>
          {theme === 'light' ? 'Dark' : 'Light'}
          <span className="readout__themeword"> theme</span>
        </button>
      </footer>
    </nav>
  )
}

/**
 * Sits on the map rather than in the rail. In the rail it fell below the fold
 * on a 1000px-tall window and was covered by the pinned readout, so satellite
 * view was effectively invisible.
 */
export function BasemapToggle() {
  const basemap = useApp((s) => s.basemap)
  const setBasemap = useApp((s) => s.setBasemap)

  return (
    <div className="basemapToggle" role="group" aria-label="Basemap">
      {([{ id: 'map', name: 'Map' }, { id: 'satellite', name: 'Satellite' }] as const).map((b) => (
        <button
          key={b.id}
          type="button"
          className={`basemapToggle__btn t-label ${basemap === b.id ? 'is-active' : ''}`}
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

  const ramp = view === 'canopy' ? CANOPY_RAMP : HEAT_RAMP

  return (
    <aside className="scale" aria-label={`Legend, ${UNIT[view]}`}>
      <span className="t-label scale__unit">{UNIT[view]}</span>
      <div className="scale__bar">
        {ramp.map((token, i) => (
          <span
            key={token}
            className="scale__stop"
            style={{
              background: `var(${view === 'people' ? '--ink-0' : token})`,
              opacity: view === 'people' ? 0.08 + i * 0.16 : 1,
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

export function YearScrubber() {
  const year = useApp((s) => s.year)
  const setYear = useApp((s) => s.setYear)
  const region = useApp((s) => s.region)
  const view = useApp((s) => s.view)
  const { grid, meta } = useRegionData(region)

  const years = grid?.years ?? []

  // Default to the most recent year the data actually has.
  useEffect(() => {
    if (years.length && (year === null || !years.includes(year))) {
      setYear(years[years.length - 1])
    }
  }, [years, year, setYear])

  if (!years.length) {
    return (
      <div className="scrubber">
        <span className="t-label">Loading imagery&hellip;</span>
      </div>
    )
  }

  const first = years[0]
  const last = years[years.length - 1]
  const span = Math.max(1, last - first)
  const scene = meta?.regions?.[region]?.ndviScenes?.[String(year)]

  return (
    <div className="scrubber">
      <div className="scrubber__label">
        <span className="t-label">Year</span>
        <span className="t-figure scrubber__year">{year ?? last}</span>
      </div>

      <div className="scrubber__track">
        <span className="scrubber__rule" aria-hidden="true" />
        {/* Ticks sit at true temporal positions, so a year with no usable
            imagery shows up as a real gap rather than being quietly skipped. */}
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

      <p className="t-unit scrubber__note">
        {view === 'canopy' && scene
          ? <>Sentinel-2 {scene.date}, {scene.cloud}% cloud. Years without a usable
              scene in the March&ndash;April window are absent.</>
          : <>Ticks mark years with usable imagery in the fixed
              March&ndash;April window.</>}
      </p>
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

export { LANDUSE_NAME }
