import { useEffect, useMemo, useRef } from 'react'
import { useRegionData } from '../data/useRegionData'
import { useApp, hasFilters, type LandUse } from '../state/store'
import { downloadGeoJson, downloadSites } from '../data/exportSites'
import { IconClose, IconDownload, IconFilter, IconGlobe } from './icons'

const LANDUSES: LandUse[] = ['roadside', 'park', 'canal', 'vacant']

/**
 * The ranked list.
 *
 * A canvas is invisible to a screen reader, so this is also the map's
 * accessible equivalent: arrow keys walk the ranking, Enter selects, and
 * selection stays in sync with the map in both directions. It is what a planner
 * actually works from — nobody plans by clicking dots.
 */
export function SiteList() {
  const region = useApp((s) => s.region)
  const view = useApp((s) => s.view)
  const open = useApp((s) => s.listOpen)
  const toggle = useApp((s) => s.toggleList)
  const selectedId = useApp((s) => s.selectedSiteId)
  const select = useApp((s) => s.selectSite)
  const filters = useApp((s) => s.filters)
  const setFilters = useApp((s) => s.setFilters)
  const clearFilters = useApp((s) => s.clearFilters)

  const { sites, grid, meta } = useRegionData(region)
  const rm = meta?.regions?.[region]
  const listRef = useRef<HTMLUListElement>(null)

  const all = useMemo(() => sites?.features ?? [], [sites])

  const species = useMemo(
    () => [...new Set(all.map((f) => f.properties.species.common))].sort(),
    [all]
  )

  const shown = useMemo(
    () =>
      all.filter((f) => {
        const p = f.properties
        if (filters.landuse.length && !filters.landuse.includes(p.landuse as LandUse)) return false
        if (filters.minPeople && p.peopleServed < filters.minPeople) return false
        if (filters.species && p.species.common !== filters.species) return false
        return true
      }),
    [all, filters]
  )

  // Keep the selected row in view when selection comes from the map.
  useEffect(() => {
    if (!selectedId || !listRef.current) return
    listRef.current
      .querySelector(`[data-site="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  if (view !== 'priority') return null

  if (!open) {
    return (
      <button type="button" className="listHandle" onClick={toggle}>
        Ranked sites <span className="t-data">{all.length}</span>
      </button>
    )
  }

  const maxPeople = Math.max(1, ...all.map((f) => f.properties.peopleServed))

  return (
    <aside className="sitelist" aria-label="Ranked planting sites">
      <header className="sitelist__head">
        <div>
          <h2 className="sitelist__title">Ranked sites</h2>
          <p className="t-unit">
            {shown.length === all.length
              ? `${all.length} in ${grid?.name ?? ''}`
              : `${shown.length} of ${all.length} shown`}
          </p>
        </div>
        <div className="sitelist__acts">
          <button
            type="button"
            className="iconBtn"
            title="Download as GeoJSON"
            aria-label="Download ranked sites as GeoJSON"
            onClick={() => downloadGeoJson(shown, region)}
          >
            <IconGlobe />
          </button>
          <button
            type="button"
            className="iconBtn"
            title="Download as CSV"
            aria-label="Download ranked sites as CSV"
            onClick={() => downloadSites(shown, region)}
          >
            <IconDownload />
          </button>
          <button
            type="button"
            className="iconBtn"
            title="Hide list"
            aria-label="Hide ranked site list"
            onClick={toggle}
          >
            <IconClose />
          </button>
        </div>
      </header>

      <div className="filters">
        <div className="filters__row">
          <span className="t-label filters__icon"><IconFilter /></span>
          {LANDUSES.map((lu) => {
            const on = filters.landuse.includes(lu)
            const count = all.filter((f) => f.properties.landuse === lu).length
            if (!count) return null
            return (
              <button
                key={lu}
                type="button"
                className={`chip ${on ? 'is-on' : ''}`}
                aria-pressed={on}
                onClick={() =>
                  setFilters({
                    landuse: on
                      ? filters.landuse.filter((x) => x !== lu)
                      : [...filters.landuse, lu],
                  })
                }
              >
                {lu} <span className="chip__n">{count}</span>
              </button>
            )
          })}
        </div>

        {species.length > 1 && (
          <div className="filters__row">
            {species.map((sp) => (
              <button
                key={sp}
                type="button"
                className={`chip ${filters.species === sp ? 'is-on' : ''}`}
                aria-pressed={filters.species === sp}
                onClick={() => setFilters({ species: filters.species === sp ? null : sp })}
              >
                {sp}
              </button>
            ))}
          </div>
        )}

        <label className="filters__range">
          <span className="t-label">
            People served ≥ <span className="t-data">{filters.minPeople.toLocaleString()}</span>
          </span>
          <input
            type="range"
            min={0}
            max={maxPeople}
            step={100}
            value={filters.minPeople}
            onChange={(e) => setFilters({ minPeople: Number(e.target.value) })}
          />
        </label>

        {hasFilters(filters) && (
          <button type="button" className="filters__clear t-label" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {rm && (
        <p className="sitelist__roll t-unit">
          All {all.length} fully grown &rarr; est.{' '}
          <span className="t-data">{(rm.co2KgPerYear / 1000).toFixed(1)} t</span> CO&#8322;
          and <span className="t-data">{rm.pm25KgPerYear.toFixed(1)} kg</span> PM2.5
          per year. {rm.diversity.count} species, {rm.diversity.topSpecies}{' '}
          {(rm.diversity.topShare * 100).toFixed(0)}% &mdash; estimated, see Method.
        </p>
      )}

      <ul className="sitelist__rows" ref={listRef}>
        {shown.map((f) => {
          const p = f.properties
          const on = p.id === selectedId
          return (
            <li key={p.id}>
              <button
                type="button"
                data-site={p.id}
                className={`row ${on ? 'is-active' : ''}`}
                aria-current={on}
                onClick={() => select(on ? null : p.id)}
              >
                <span className="row__rank t-data">{p.rank ?? '—'}</span>
                <span className="row__body">
                  <span className="row__top">
                    <span className="row__species">{p.species.common}</span>
                    <span className="row__delta t-data">
                      +{(p.lstC - p.baselineC).toFixed(1)}°C
                    </span>
                  </span>
                  <span className="row__meta t-unit">
                    {p.landuse} · {p.peopleServed.toLocaleString()} people · score{' '}
                    {p.score.toFixed(2)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        {!shown.length && (
          <li className="sitelist__empty t-unit">
            No site matches these filters. Every ranked site is still on the map.
          </li>
        )}
      </ul>
    </aside>
  )
}
