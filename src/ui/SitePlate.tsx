import { useEffect } from 'react'
import { PLACEHOLDER_SITES } from '../data/placeholderSites'
import { useApp } from '../state/store'

/** The ranking formula, shown openly. A hidden score is a score nobody trusts. */
const TERMS = [
  { key: 'heat', label: 'Heat need', weight: 0.45 },
  { key: 'canopy', label: 'Canopy absence', weight: 0.3 },
  { key: 'people', label: 'People served', weight: 0.25 },
] as const

export function SitePlate() {
  const id = useApp((s) => s.selectedSiteId)
  const selectSite = useApp((s) => s.selectSite)
  const site = PLACEHOLDER_SITES.find((s) => s.id === id)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && selectSite(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectSite])

  if (!site) return null

  const delta = site.lstC - site.baselineC
  const parts = {
    heat: Math.min(1, delta / 8),
    canopy: 0.7,
    people: Math.min(1, site.peopleServed / 5600),
  }

  return (
    <section className="plate" role="dialog" aria-label="Planting site detail">
      <header className="plate__head">
        <div>
          <h2 className="t-subhead plate__title">Planting site</h2>
          <p className="t-data plate__coords">
            {site.lat.toFixed(5)}, {site.lon.toFixed(5)}
          </p>
        </div>
        <button type="button" className="plate__close" onClick={() => selectSite(null)} aria-label="Close">
          &times;
        </button>
      </header>

      <dl className="plate__facts">
        <div>
          <dt className="t-label">Land use</dt>
          <dd className="t-data">{site.landuse}</dd>
        </div>
        <div>
          <dt className="t-label">Plantable area</dt>
          <dd className="t-data">
            {site.areaM2.toLocaleString()} <span className="t-unit">m&sup2;</span>
          </dd>
        </div>
      </dl>

      <div className="plate__block">
        <h3 className="t-label">Heat cost</h3>
        <p className="t-figure plate__figure">
          +{delta.toFixed(1)}<span className="t-unit plate__figureunit">&deg;C surface</span>
        </p>
        <p className="t-unit">
          {site.lstC.toFixed(1)}&deg;C here against a {site.baselineC.toFixed(1)}&deg;C shaded
          baseline for this neighbourhood. Surface temperature, not air.
        </p>
      </div>

      <div className="plate__block">
        <h3 className="t-label">People served</h3>
        <p className="t-figure plate__figure">
          {site.peopleServed.toLocaleString()}<span className="t-unit plate__figureunit">within 400 m</span>
        </p>
      </div>

      <div className="plate__block">
        <h3 className="t-label">Score {site.score.toFixed(2)}</h3>
        {TERMS.map((t) => (
          <div key={t.key} className="term">
            <span className="t-data term__label">{t.label}</span>
            <span className="term__bar" aria-hidden="true">
              <span className="term__fill" style={{ width: `${parts[t.key] * 100}%` }} />
            </span>
            <span className="t-unit term__weight">&times;{t.weight}</span>
          </div>
        ))}
      </div>

      <div className="plate__block">
        <h3 className="t-label">Plant here</h3>
        <div className="species">
          <p className="t-subhead species__common">{site.species.common}</p>
          <p className="t-body species__botanical">{site.species.botanical}</p>
          <p className="t-unit species__because">{site.species.because}</p>
        </div>
        <p className="t-unit plate__caveat">
          Best-effort match from site conditions, not a horticulture guarantee.
          Confirm with the Parks &amp; Horticulture Authority or a nursery.
        </p>
      </div>
    </section>
  )
}
