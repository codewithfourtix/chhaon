import { useEffect, useState } from 'react'
import { useRegionData } from '../data/useRegionData'
import { useApp } from '../state/store'
import { IconCheck, IconCopy, IconExternal } from './icons'

const TERM_LABEL: Record<string, string> = {
  heat: 'Heat need',
  canopy: 'Canopy absence',
  people: 'People served',
}

export function SitePlate() {
  const [copied, setCopied] = useState(false)
  const id = useApp((s) => s.selectedSiteId)
  const region = useApp((s) => s.region)
  const selectSite = useApp((s) => s.selectSite)
  const { sites, meta } = useRegionData(region)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && selectSite(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectSite])

  const feature = sites?.features.find((f) => f.properties.id === id)
  if (!feature) return null

  const p = feature.properties
  const [lon, lat] = feature.geometry.coordinates
  const delta = p.lstC - p.baselineC
  const weights = meta?.weights ?? { heat: 0.45, canopy: 0.3, people: 0.25 }

  return (
    <section className="plate" role="dialog" aria-label="Planting site detail">
      <header className="plate__head">
        <div className="plate__id">
          <h2 className="t-subhead plate__title">
            {p.rank ? <span className="plate__rank t-data">{p.rank}</span> : null}
            Planting site
          </h2>
          <div className="plate__loc">
            <p className="t-data plate__coords">{lat.toFixed(5)}, {lon.toFixed(5)}</p>
            <button
              type="button"
              className="miniBtn"
              title={copied ? 'Copied' : 'Copy coordinates'}
              aria-label="Copy coordinates"
              onClick={async () => {
                const text = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
                try {
                  await navigator.clipboard.writeText(text)
                } catch {
                  // Clipboard is blocked in some contexts; fall back to a
                  // selectable prompt rather than failing silently.
                  window.prompt('Copy these coordinates', text)
                }
                setCopied(true)
                setTimeout(() => setCopied(false), 1600)
              }}
            >
              {copied ? <IconCheck /> : <IconCopy />}
            </button>
            <a
              className="miniBtn"
              href={`https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`}
              target="_blank"
              rel="noreferrer noopener"
              title="Open in Google Maps"
              aria-label="Open this site in Google Maps"
            >
              <IconExternal />
            </a>
          </div>
        </div>
        <button type="button" className="plate__close" onClick={() => selectSite(null)} aria-label="Close">
          &times;
        </button>
      </header>

      <dl className="plate__facts">
        <div>
          <dt className="t-label">Land use</dt>
          <dd className="t-data">{p.landuse}</dd>
        </div>
        <div>
          <dt className="t-label">Cell area</dt>
          <dd className="t-data">
            {p.areaM2.toLocaleString()} <span className="t-unit">m&sup2;</span>
          </dd>
        </div>
      </dl>

      <div className="plate__block">
        <h3 className="t-label">Heat cost</h3>
        <p className="t-figure plate__figure">
          +{delta.toFixed(1)}<span className="t-unit plate__figureunit">&deg;C surface</span>
        </p>
        <p className="t-unit">
          {p.lstC.toFixed(1)}&deg;C measured here against a {p.baselineC.toFixed(1)}&deg;C
          baseline taken from this region's own well-vegetated ground. Landsat
          surface temperature, mid-morning overpass &mdash; not air temperature,
          and not peak afternoon heat.
        </p>
      </div>

      <div className="plate__block">
        <h3 className="t-label">People served</h3>
        <p className="t-figure plate__figure">
          {p.peopleServed.toLocaleString()}
          <span className="t-unit plate__figureunit">within ~200 m</span>
        </p>
        <p className="t-unit">WorldPop 2020 constrained, 100 m grid.</p>
      </div>

      <div className="plate__block">
        <h3 className="t-label">Score {p.score.toFixed(2)}</h3>
        {(['heat', 'canopy', 'people'] as const).map((k) => (
          <div key={k} className="term">
            <span className="t-data term__label">{TERM_LABEL[k]}</span>
            <span className="term__bar" aria-hidden="true">
              <span className="term__fill" style={{ width: `${p.terms[k] * 100}%` }} />
            </span>
            <span className="t-unit term__weight">&times;{weights[k]}</span>
          </div>
        ))}
        <p className="t-unit plate__caveat">
          Vegetation index here is {p.ndvi.toFixed(2)}.
        </p>
      </div>

      <div className="plate__block">
        <h3 className="t-label">Plant here</h3>
        <div className="species">
          <p className="t-subhead species__common">{p.species.common}</p>
          <p className="t-body species__botanical">{p.species.botanical}</p>
          <p className="t-unit species__because">{p.species.because}</p>
        </div>
        <p className="t-unit plate__caveat">
          Matched on the site's land use and available width, not on climate:
          every weather API with free coverage of Lahore resolves all three
          regions to one grid cell, so climate cannot distinguish these sites.
          Confirm with the Parks &amp; Horticulture Authority or a nursery.
        </p>
      </div>
    </section>
  )
}
