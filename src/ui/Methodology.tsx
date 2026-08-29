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
          <h2 className="t-heading">Risk bands, and what they are</h2>
          <p className="t-body">
            The Risk view is a <strong>relabelling of data already measured</strong>,
            not a new analysis: surface temperature above this region&apos;s own
            well-vegetated baseline, weighted 60/40 against how far below the
            vegetation threshold the cell sits. Four fixed bands, because a
            report says &ldquo;High risk&rdquo; and a gradient does not.
          </p>
          <p className="t-body">
            The band edges are the same in every region deliberately. Clipping
            them to each region&apos;s own spread would make &ldquo;High&rdquo;
            mean something different in Model Town than in DHA, which is exactly
            what you do not want when the whole point is comparing places.
          </p>
        </section>

        <section className="method__sec">
          <h2 className="t-heading">CO&#8322; and PM2.5 are estimates, not measurements</h2>
          <p className="t-body">
            Both come from <strong>one published coefficient applied to a
            species&apos; mature crown area</strong> &mdash; roughly 0.44 kg CO&#8322;
            and 1.2 g PM2.5 per m&sup2; of crown per year, anchored on standard
            urban-forestry figures. We could have invented seven per-species
            constants; stating one openly is more defensible than pretending to
            field data we do not have for Lahore.
          </p>
          <p className="t-body">
            Two things follow, and both are worth saying out loud. First, these
            assume every tree survives to maturity, which in practice they do
            not. Second, the totals are <strong>honest but modest</strong>: all
            600 recommended sites fully grown come to roughly 19 tonnes of CO&#8322;
            a year, about four cars&apos; worth. Urban planting is a heat and air
            quality intervention at this scale, not a carbon strategy, and the
            number says so.
          </p>
        </section>

        <section className="method__sec">
          <h2 className="t-heading">Species matching, and monoculture risk</h2>
          <p className="t-body">
            An earlier version picked the first species in list order that
            cleared the land-use and width bars. Neem sits first and clears a
            roadside verge at 3 m &mdash; the lowest bar of any species &mdash;
            and roadside is 91&ndash;100% of the plantable public land here, so
            Neem won almost every site. <strong>Every region came out
            91&ndash;100% Neem.</strong>
          </p>
          <p className="t-body">
            That is a genuine urban-forestry failure, not just a cosmetic one:
            a uniform avenue loses the entire street to one pest or disease.
            Eligible species are now scored on canopy delivered, drought
            tolerance against the site&apos;s own vegetation index, water
            affinity against canal-side ground, and an explicit diversity term
            that steers away from any species already over its share.
            {rm?.diversity && (
              <> In {REGIONS.find((r) => r.id === region)?.name} that gives{' '}
                <span className="t-data">{rm.diversity.count}</span> species with{' '}
                {rm.diversity.topSpecies} at{' '}
                <span className="t-data">
                  {(rm.diversity.topShare * 100).toFixed(0)}%
                </span>.</>
            )}
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
          <h2 className="t-heading">Why there is no AQI reading</h2>
          <p className="t-body">
            Smog is Lahore&apos;s most visible environmental problem, so the
            obvious feature is &ldquo;AQI here, before and after&rdquo;. We could
            not build that without inventing data, and the reason is worth
            stating rather than hiding.
          </p>
          <ul className="method__list t-body">
            <li>
              <strong>Measured AQI does not exist at neighbourhood scale.</strong>{' '}
              Lahore has a handful of ground stations, and every free API serving
              them now needs a key &mdash; OpenAQ v3 returns 401, v2 is retired.
            </li>
            <li>
              <strong>Satellite air quality is too coarse.</strong> Sentinel-5P is
              open and keyless, but its NO&#8322; pixels are{' '}
              <span className="t-data">5.5 &times; 3.5 km</span>. These regions are
              4&ndash;8 km across, so all five would land in one to four pixels and
              read nearly the same &mdash; exactly the failure that made us drop
              climate data from species matching.
            </li>
            <li>
              <strong>Captured mass is not an AQI delta.</strong> Turning
              kilograms of PM2.5 removed into AQI points needs a dispersion model,
              mixing heights and background concentrations we do not have.
            </li>
          </ul>
          <p className="t-body">
            So the Air panel reports the one air-quality quantity we can defend:
            how much particulate the recommended planting would capture, from
            crown area and one published coefficient. It says what planting would
            <strong> remove</strong>, never what the air currently <strong>is</strong>.
            A number we could not defend would undermine every measured figure
            beside it.
          </p>
        </section>

        <section className="method__sec">
          <h2 className="t-heading">What this is not, yet</h2>
          <p className="t-body">
            Named here rather than implied, because a tool that is clear about
            its own edges is easier to trust than one that is not.
          </p>
          <ul className="method__list t-body">
            <li>
              <strong>Live air quality.</strong> Everything here is precomputed
              and committed, so nothing can fail mid-demo. A live AQI feed would
              be the first runtime dependency, and the right way to add it is at
              regeneration time into the same static files &mdash; genuinely
              current, still demo-safe.
            </li>
            <li>
              <strong>A WMS/XYZ endpoint.</strong> GeoJSON export exists; serving
              the layers as tiles a GIS can subscribe to is the natural next step.
            </li>
            <li>
              <strong>Corridor analysis.</strong> Clusters of top sites along a
              connected stretch of road or canal are worth more than the same
              trees scattered. The data to detect that is already on hand.
            </li>
            <li>
              <strong>Shade simulation.</strong> Drawing each recommendation&apos;s
              mature canopy over the imagery would make the payoff legible at a
              glance.
            </li>
            <li>
              <strong>Change detection.</strong> Only honest once more years of
              stable data exist &mdash; our own finding is that the 2017&ndash;2025
              series does not yet show a real trend.
            </li>
            <li>
              <strong>Urdu interface, PDF reports, city-wide ranking, and a
              planner mode</strong> that records what has actually been planted.
            </li>
          </ul>
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
