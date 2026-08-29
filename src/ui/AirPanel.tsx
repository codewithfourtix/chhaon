import { useMemo } from 'react'
import { useRegionData } from '../data/useRegionData'
import { useApp } from '../state/store'
import { IconClose } from './icons'

/**
 * Air quality, answered as honestly as the available data allows.
 *
 * The obvious version of this feature is "AQI here, before and after". We could
 * not build that without inventing data, and the reason is worth stating rather
 * than hiding:
 *
 *  - **Measured AQI does not exist at neighbourhood resolution.** Lahore has a
 *    handful of ground stations, and every free API that serves them now needs
 *    a key (OpenAQ v3 returns 401; v2 is retired).
 *  - **Satellite air quality is too coarse.** Sentinel-5P is open and keyless,
 *    but its NO2 pixels are 5.5 x 3.5 km. Our regions are 4-8 km across, so all
 *    five would land in one to four pixels and read nearly identically — the
 *    exact failure that made us drop climate data from species matching.
 *  - **Captured mass is not an AQI delta.** Converting kilograms of PM2.5
 *    removed into AQI points needs a dispersion model, mixing heights and
 *    background concentrations we do not have.
 *
 * So this panel reports the one air-quality quantity we can defend: how much
 * particulate the recommended planting would capture, from crown area and one
 * published coefficient. It says what planting would *remove*, never what the
 * air currently *is*.
 */
export function AirPanel() {
  const open = useApp((s) => s.airOpen)
  const toggle = useApp((s) => s.toggleAir)
  const region = useApp((s) => s.region)
  const area = useApp((s) => s.area)
  const { sites, grid, meta } = useRegionData(region)

  const rm = meta?.regions?.[region]
  const features = useMemo(() => sites?.features ?? [], [sites])

  const inArea = useMemo(() => {
    if (!area) return features
    return features.filter((f) => {
      const [lon, lat] = f.geometry.coordinates
      return lon >= area.w && lon <= area.e && lat >= area.s && lat <= area.n
    })
  }, [features, area])

  if (!open) return null

  const pm25G = inArea.reduce((s, f) => s + f.properties.species.pm25GPerYear, 0)
  const crownM2 = inArea.reduce((s, f) => s + f.properties.species.crownM2, 0)
  const scope = area ? 'the selected area' : grid?.name

  return (
    <aside className="airPanel" aria-label="Air quality contribution">
      <header className="costPanel__head">
        <div>
          <h2 className="costPanel__title">Air</h2>
          <p className="t-unit">{scope} · {inArea.length} sites</p>
        </div>
        <button type="button" className="iconBtn" onClick={toggle} aria-label="Close air panel">
          <IconClose />
        </button>
      </header>

      <div className="costPanel__total">
        <span className="t-figure">{(pm25G / 1000).toFixed(1)} kg</span>
        <span className="t-unit">
          of PM2.5 captured per year, once these {inArea.length} are mature
        </span>
      </div>

      <dl className="costPanel__rows">
        <div>
          <dt className="t-label">Mature canopy added</dt>
          <dd className="t-data">{(crownM2 / 10000).toFixed(2)} ha</dd>
        </div>
        <div>
          <dt className="t-label">Per tree, average</dt>
          <dd className="t-data">
            {inArea.length ? Math.round(pm25G / inArea.length) : 0} g / yr
          </dd>
        </div>
        {rm && !area && (
          <div>
            <dt className="t-label">Whole region</dt>
            <dd className="t-data">{rm.pm25KgPerYear.toFixed(1)} kg / yr</dd>
          </div>
        )}
      </dl>

      <p className="t-unit costPanel__note">
        This is what planting would <strong>remove</strong>, not what the air
        currently is. Estimated from mature crown area and one published
        coefficient &mdash; not measured.
      </p>

      <details className="airPanel__why">
        <summary className="t-label">Why no AQI reading?</summary>
        <p className="t-unit">
          No free source gives measured air quality at neighbourhood scale.
          Ground stations are sparse and their APIs now need keys. Sentinel-5P is
          open, but its pixels are <span className="t-data">5.5 &times; 3.5 km</span>
          {' '}&mdash; wider than most of these regions, so all five would read
          nearly the same number. That is the same reason species matching
          ignores climate data.
        </p>
        <p className="t-unit">
          Converting captured mass into AQI points would need a dispersion model
          we do not have. Showing a number we cannot defend would undermine every
          measured figure next to it.
        </p>
      </details>
    </aside>
  )
}
