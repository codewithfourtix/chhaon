import { REGIONS } from '../data/regions'
import { useRegionData } from '../data/useRegionData'
import { useApp } from '../state/store'

/**
 * The credibility surface. Written to be read closely by someone looking for
 * the hole in it — so the limits are stated first, not buried.
 */
export function Methodology() {
  const back = useApp((s) => s.enterWorkspace)
  const region = useApp((s) => s.region)
  const { meta } = useRegionData(region)
  const rm = meta?.regions?.[region]

  return (
    <div className="method">
      <div className="method__inner">
        <header className="method__head">
          <div>
            <p className="t-label">Chhaon</p>
            <h1 className="t-plate-title method__title">Method</h1>
          </div>
          <button type="button" className="overture__enter" onClick={back}>
            Back to the map
          </button>
        </header>

        <section className="method__sec">
          <h2 className="t-heading">What we found, and what we did not</h2>
          <p className="t-body">
            <strong>We do not find a monotonic decline in green cover.</strong>{' '}
            Across 2017&ndash;2025 the vegetated share of Model Town moves up and
            down without trend
            {rm?.vegPctByYear && (
              <> &mdash;{' '}
                {Object.entries(rm.vegPctByYear)
                  .map(([y, v]) => `${y}: ${v}%`).join(' · ')}</>
            )}. Spring vegetation in Punjab tracks winter rainfall far more
            strongly than it tracks development, so this series cannot carry a
            "the city is losing its trees" claim, and we do not make one.
          </p>
          <p className="t-body">
            What does hold up is a <strong>within-scene</strong> comparison. On a
            single satellite pass &mdash; same day, same sensor, same atmosphere
            &mdash; bare ground runs{' '}
            {rm?.heatGapC != null
              ? <span className="t-data">{rm.heatGapC}&deg;C</span>
              : 'measurably'}{' '}
            hotter at the surface than well-vegetated ground
            {rm?.ndviLstCorr != null && (
              <>, with a correlation of{' '}
                <span className="t-data">{rm.ndviLstCorr}</span> between
                vegetation index and surface temperature across every cell</>
            )}. That is the finding the priority map is built on: it needs no
            trend, only today's measurement.
          </p>
        </section>

        <section className="method__sec">
          <h2 className="t-heading">What we can and cannot claim</h2>
          <p className="t-body">
            Sentinel-2 resolves 10 metres per pixel. That is enough to measure
            <strong> green cover</strong> and it is not enough to count trees, so
            nothing here is described as tree canopy. A cell reported as
            vegetated may be lawn, crop, scrub or canopy.
          </p>
          <p className="t-body">
            Landsat's thermal band is 100 metres per pixel, resampled to 30.
            It measures <strong>land surface temperature</strong>, which is not
            air temperature and runs considerably hotter. The overpass over
            Lahore is mid-morning, so these are morning surface temperatures,
            not the afternoon peak.
          </p>
          <p className="t-body">
            Both are averaged into a 60&nbsp;m analysis grid. A single cell is a
            neighbourhood-scale statement, not a parcel-level one.
          </p>
        </section>

        <section className="method__sec">
          <h2 className="t-heading">Why the year scrubber exists at all</h2>
          <p className="t-body">
            It shows the observed green cover for each year we have usable
            imagery. It is an observation, not a trend line.
          </p>
          <p className="t-body">
            NDVI in Lahore changes more between March and October of one year
            than it does across a decade of development. Comparing whichever
            scene happened to be clearest each year would measure the timing of
            spring and call it tree loss.
          </p>
          <p className="t-body">
            A single date cannot carry the claim either. Lahore's spring haze and
            its rainfall-driven green-up moved Model Town's vegetated fraction
            from <span className="t-data">34%</span> to{' '}
            <span className="t-data">23%</span> to{' '}
            <span className="t-data">8%</span> to{' '}
            <span className="t-data">47%</span> across 2017&ndash;2020 on nearly
            identical calendar dates. That is measurement noise, not tree loss.
          </p>
          <p className="t-body">
            Cloud and haze both <em>depress</em> NDVI, so each year is a
            <strong> maximum-value composite</strong> of the several scenes
            nearest the target date &mdash; the standard treatment, and the reason
            the cloud threshold can be relaxed: the compositing does the
            rejecting.
          </p>
          <p className="t-body">
            So each year is sampled from a fixed window
            {meta && <> (<span className="t-data">{meta.ndviWindow[0]}</span> to{' '}
              <span className="t-data">{meta.ndviWindow[1]}</span>)</>}, and within
            that window we take the scene nearest a fixed target date rather than
            the least cloudy one. A year with no usable scene inside its window
            is <strong>dropped</strong>, never substituted from another season.
            That is why the year scrubber has gaps.
          </p>
        </section>

        <section className="method__sec">
          <h2 className="t-heading">How a site is scored</h2>
          <p className="t-body">
            Every plantable cell gets a score from three measured terms. The
            weights are fixed and shown on every site:
          </p>
          <ul className="method__list t-body">
            <li>
              <span className="t-data">
                {meta ? meta.weights.heat : 0.45}
              </span>{' '}
              <strong>heat need</strong> &mdash; how far above the region's own
              well-vegetated baseline this cell's surface runs.
            </li>
            <li>
              <span className="t-data">
                {meta ? meta.weights.canopy : 0.3}
              </span>{' '}
              <strong>canopy absence</strong> &mdash; how far below the vegetation
              threshold the cell sits today.
            </li>
            <li>
              <span className="t-data">
                {meta ? meta.weights.people : 0.25}
              </span>{' '}
              <strong>people served</strong> &mdash; WorldPop density in the
              surrounding cells.
            </li>
          </ul>
          <p className="t-body">
            Cells are excluded unless OpenStreetMap shows them as genuinely
            plantable public ground &mdash; a park, a road verge, a canal bank or
            vacant land &mdash; and not covered by a building. Sites are spaced so
            the ranking does not return the same block twenty times.
          </p>
        </section>

        <section className="method__sec">
          <h2 className="t-heading">Why species matching ignores climate</h2>
          <p className="t-body">
            The obvious approach is to pull climate data per coordinate. It does
            not work here, and we verified that rather than assuming it: every
            free weather API with Pakistan coverage resolves Model Town, Gulberg
            and DHA to a <strong>single grid cell</strong>. NASA POWER returns
            byte-identical temperature, wind and elevation for all three. A
            climate-driven matcher would recommend the same tree for every site
            on the map.
          </p>
          <p className="t-body">
            So species are matched on what actually differs between one pin and
            the next: land use, available planting width, and proximity to water.
            The shortlist is drawn from Punjab Forest Department and University
            of Agriculture Faisalabad guidance for central Punjab. It is a
            best-effort match, not a horticulture guarantee &mdash; a real
            deployment confirms with the Parks &amp; Horticulture Authority.
          </p>
        </section>

        <section className="method__sec">
          <h2 className="t-heading">Sources</h2>
          <dl className="method__sources">
            <div><dt className="t-label">Green cover</dt>
              <dd className="t-body">Sentinel-2 L2A, 10 m, via Element 84 Earth Search</dd></div>
            <div><dt className="t-label">Surface temperature</dt>
              <dd className="t-body">Landsat 8/9 Collection 2 Level-2, via Microsoft Planetary Computer</dd></div>
            <div><dt className="t-label">Plantable land</dt>
              <dd className="t-body">OpenStreetMap via Overpass (ODbL)</dd></div>
            <div><dt className="t-label">Population</dt>
              <dd className="t-body">WorldPop 2020 constrained, 100 m</dd></div>
            <div><dt className="t-label">Basemap</dt>
              <dd className="t-body">OpenFreeMap &middot; satellite imagery &copy; Esri, Maxar</dd></div>
          </dl>
          <p className="t-unit">
            All free and public. No API key is required to reproduce any of it.
            {meta && <> Pipeline last run <span className="t-data">{meta.generated}</span>.</>}
          </p>
        </section>

        <section className="method__sec">
          <h2 className="t-heading">The three regions compared</h2>
          <p className="t-body">
            The heat gap is not uniform, and the differences are worth stating
            rather than averaging away.
          </p>
          <div className="cmp">
            <div className="cmp__row cmp__row--head">
              <span className="t-label">Region</span>
              <span className="t-label">Shade worth</span>
              <span className="t-label">NDVI/LST r</span>
              <span className="t-label">Baseline</span>
              <span className="t-label">Sites</span>
            </div>
            {REGIONS.map((r) => {
              const m = meta?.regions?.[r.id]
              if (!m) return null
              const weak = (m.ndviLstCorr ?? 0) > -0.3
              return (
                <div key={r.id} className="cmp__row">
                  <span className="t-body">{r.name}</span>
                  <span className={`t-data ${weak ? 'cmp__weak' : 'cmp__strong'}`}>
                    {m.heatGapC?.toFixed(1) ?? '—'}&deg;C
                  </span>
                  <span className={`t-data ${weak ? 'cmp__weak' : ''}`}>
                    {m.ndviLstCorr?.toFixed(2) ?? '—'}
                  </span>
                  <span className="t-data">{m.baselineC}&deg;C</span>
                  <span className="t-data">{m.siteCount}</span>
                </div>
              )
            })}
          </div>
          <p className="t-body">
            <strong>DHA is the weak one</strong> and we are not hiding it. Its
            bounds reach into farmland at the southern edge, which blurs the
            built-versus-vegetated contrast the whole measurement depends on. Its
            ranking still stands on measured heat and measured vegetation, but
            the headline relationship is thinner there than in Model Town or
            Gulberg.
          </p>
        </section>

        <section className="method__sec">
          <h2 className="t-heading">Scenes actually used</h2>
          {REGIONS.map((r) => {
            const rm = meta?.regions?.[r.id]
            if (!rm) return null
            return (
              <div key={r.id} className="method__scenes">
                <h3 className="t-subhead">{r.name}</h3>
                <p className="t-unit">
                  Heat: {rm.lstScene.id} &middot; {rm.lstScene.datetime} &middot;{' '}
                  {rm.lstScene.cloud}% cloud &middot; baseline{' '}
                  <span className="t-data">{rm.baselineC}&deg;C</span>
                </p>
                <p className="t-unit">
                  Green cover:{' '}
                  {rm.years.map((y) => {
                    const sc = rm.ndviScenes[String(y)]
                    return sc ? `${y} (${sc.composited ?? 1} scenes)` : null
                  }).filter(Boolean).join(' · ')}
                </p>
              </div>
            )
          })}
        </section>
      </div>
    </div>
  )
}
