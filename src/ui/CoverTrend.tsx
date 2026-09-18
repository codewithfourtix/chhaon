import { useEffect, useMemo, useState } from 'react'
import { activePeriod, allYearsLoaded, heatYear, useNdviYears } from '../data/load'
import {
  blindSpots, loadMonthly, monthLabel, usableMonths, yearOnYear, type MonthlyDoc,
} from '../data/monthly'
import { statsForBox } from '../data/subarea'
import { downloadGeoPng, downloadGridGeoJson } from '../data/exportLayers'
import { useRegionData } from '../data/useRegionData'
import { useApp } from '../state/store'
import { IconClose, IconGlobe, IconSelect } from './icons'

const RAMP = {
  light: ['#E6EBE7', '#C3D6C4', '#97BC9C', '#6BA077', '#3E8459', '#0F7A48'],
  dark: ['#14251C', '#1C3A2A', '#26523A', '#32704C', '#3FB871', '#7FE0A5'],
}

/**
 * Observed vegetated cover, for the whole region or a drawn sub-area.
 *
 * This panel is one line of caveat away from contradicting the product's most
 * important claim. The Method screen says plainly that no monotonic trend was
 * found and that Lahore's year-to-year vegetated share tracks winter rainfall
 * far more strongly than development. A bare "−1.3 points since 2017" printed
 * without that would undo it.
 *
 * So the change figure is labelled an *observation between two years*, never a
 * trend, and the caveat sits under it rather than behind a tooltip.
 */
export function CoverTrend() {
  const region = useApp((s) => s.region)
  const view = useApp((s) => s.view)
  const year = useApp((s) => s.year)
  const cadence = useApp((s) => s.cadence)
  const theme = useApp((s) => s.theme)
  const setYear = useApp((s) => s.setYear)
  const area = useApp((s) => s.area)
  const drawing = useApp((s) => s.drawing)
  const setArea = useApp((s) => s.setArea)
  const setDrawing = useApp((s) => s.setDrawing)
  const { grid } = useRegionData(region)
  // The series is built from every year, which now arrive progressively, so this
  // has to recompute as they land.
  const ndviVersion = useNdviYears()

  // Recomputed over whichever cells the drawn box contains — no new data, and
  // the same arithmetic the whole-region figure uses.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const month = useApp((s) => s.month)
  const heatYr = grid ? heatYear(grid, activePeriod(cadence, year, month)) : null
  const stats = useMemo(
    () => (grid && heatYr !== null ? statsForBox(grid, area, heatYr) : null),
    [grid, area, heatYr, ndviVersion])

  const series = useMemo(() => {
    if (!stats || !grid) return []
    return grid.years
      .map((y) => ({ year: y, pct: stats.vegPctByYear[y] }))
      .filter((d): d is { year: number; pct: number } => typeof d.pct === 'number')
  }, [stats, grid])

  if (view !== 'canopy' || !grid) return null
  if (cadence === 'monthly') return <MonthlyCover />

  const lo = series.length ? Math.min(...series.map((d) => d.pct)) : 0
  const hi = series.length ? Math.max(...series.map((d) => d.pct)) : 1
  const span = Math.max(1, hi - lo)
  const first = series[0]
  const last = series[series.length - 1]
  const current = series.find((d) => d.year === year) ?? last

  return (
    <aside className="cover" aria-label="Observed vegetated cover">
      <header className="cover__head">
        <div>
          <h2 className="cover__title">Green cover</h2>
          <p className="t-unit">
            {area
              ? `Selected area · ${stats?.areaKm2.toFixed(2)} km²`
              : grid.name}
          </p>
        </div>
        <div className="sitelist__acts">
          <button
            type="button"
            className={`iconBtn ${drawing ? 'is-on' : ''}`}
            title={drawing ? 'Drag on the map to select' : 'Select an area'}
            aria-pressed={drawing}
            onClick={() => setDrawing(!drawing)}
          >
            <IconSelect />
          </button>
          {area && (
            <button
              type="button"
              className="iconBtn"
              title="Clear selection"
              aria-label="Clear the selected area"
              onClick={() => setArea(null)}
            >
              <IconClose />
            </button>
          )}
        </div>
      </header>

      {drawing && !area && (
        <p className="cover__hint t-unit">Drag a box on the map.</p>
      )}

      {series.length >= 2 ? (
        <>
          <div className="cover__now">
            <span className="t-figure cover__pct">{current.pct.toFixed(1)}%</span>
            <span className="t-unit">of ground vegetated in {current.year}</span>
          </div>

          <div
            className="cover__chart"
            role="img"
            aria-label={`Vegetated cover from ${first.pct.toFixed(1)}% in ${first.year} to ${last.pct.toFixed(1)}% in ${last.year}`}
          >
            {series.map((d) => (
              <button
                key={d.year}
                type="button"
                className={`cover__bar ${d.year === current.year ? 'is-active' : ''}`}
                style={{ height: `${18 + ((d.pct - lo) / span) * 82}%` }}
                title={`${d.year}: ${d.pct.toFixed(1)}%`}
                aria-label={`Show ${d.year}, ${d.pct.toFixed(1)} percent`}
                onClick={() => setYear(d.year)}
              />
            ))}
          </div>
          <div className="cover__axis t-unit">
            <span>{first.year}</span>
            <span>{last.year}</span>
          </div>

          <p className="cover__change t-data">
            {last.pct - first.pct >= 0 ? '+' : ''}
            {(last.pct - first.pct).toFixed(1)} points
            <span className="t-unit"> between {first.year} and {last.year}</span>
          </p>

          {stats && (
            <p className="t-unit cover__extra">
              {stats.meanLstC !== null && <>Mean surface {stats.meanLstC.toFixed(1)}°C in summer {heatYr}. </>}
              {stats.people !== null && <>About {stats.people.toLocaleString()} people. </>}
              {stats.cells.toLocaleString()} cells.
            </p>
          )}

          <p className="t-unit cover__caveat">
            An observation between two years, <strong>not a trend</strong>. Spring
            vegetation here tracks winter rainfall far more strongly than
            development — this series swings {lo.toFixed(0)}–{hi.toFixed(0)}% with
            no monotonic direction. See Method.
          </p>

          {/* The swing above is the panel's whole argument, and it is computed
              from the years currently in memory. While the rest are still
              arriving it would understate the range, so say so rather than
              printing a figure that quietly changes a second later. */}
          {!allYearsLoaded(grid) && (
            <p className="t-unit cover__pending">
              {series.length} of {grid.years.length} years loaded — the range will
              widen as the rest arrive.
            </p>
          )}
        </>
      ) : (
        <p className="cover__hint t-unit">
          Too few cells with a usable reading in this area to report cover.
        </p>
      )}

      <div className="cover__exports">
        <button
          type="button"
          className="footBtn"
          title="Every measured layer as GeoJSON cells"
          onClick={() => downloadGridGeoJson(grid)}
        >
          <IconGlobe />
          <span>Grid GeoJSON</span>
        </button>
        <button
          type="button"
          className="footBtn"
          title="This layer as a georeferenced PNG plus world file"
          onClick={() =>
            downloadGeoPng(grid, 'canopy', year === null ? null : String(year), {
              stops: RAMP[theme],
              lo: 0,
              hi: Math.max(0.35, hi / 100 + 0.2),
            })
          }
        >
          <span>GeoPNG</span>
        </button>
      </div>
    </aside>
  )
}

/**
 * Green cover month by month, over the recent two years.
 *
 * A different question from the yearly chart above, and it must not be read as the
 * same one. The yearly series is locked to one spring window so that 2017 and 2025
 * are comparable; this one deliberately is not locked, which makes it a picture of
 * **the season**. Model Town runs about 56% vegetated in October, 31% by June, and
 * back to 58% the following September — a fall across those months is the year
 * turning, not trees coming down.
 *
 * So the only year-on-year figure offered here is the same month a year earlier.
 * September against September says something; September against June says only
 * that the monsoon happened.
 *
 * Months with no composite are drawn as gaps with their reason, because about a
 * third of the Lahore year cannot be read from orbit at all and a blank stretch
 * nobody explains looks like a broken chart.
 */
function MonthlyCover() {
  const region = useApp((s) => s.region)
  const month = useApp((s) => s.month)
  const setMonth = useApp((s) => s.setMonth)
  const area = useApp((s) => s.area)
  const { grid } = useRegionData(region)

  const [doc, setDoc] = useState<MonthlyDoc | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    setLoading(true)
    loadMonthly(region).then((d) => {
      if (!live) return
      setDoc(d)
      setLoading(false)
    })
    return () => {
      live = false
    }
  }, [region])

  const months = useMemo(() => usableMonths(doc), [doc])
  if (!grid) return null

  const current = months.find((p) => p.period === month) ?? months[months.length - 1]
  const prior = doc && current ? yearOnYear(doc, current.period) : null

  const pcts = months.map((p) => p.vegPct ?? 0)
  const lo = pcts.length ? Math.min(...pcts) : 0
  const hi = pcts.length ? Math.max(...pcts) : 1
  const span = Math.max(1, hi - lo)

  return (
    <aside className="cover" aria-label="Observed vegetated cover by month">
      <header className="cover__head">
        <div>
          <h2 className="cover__title">Green cover</h2>
          <p className="t-unit">{grid.name} · by month</p>
        </div>
      </header>

      {loading ? (
        <p className="cover__hint t-unit">Reading the monthly series…</p>
      ) : !doc || months.length < 2 ? (
        <div className="alertsPanel__empty">
          <p className="t-unit">
            No monthly composites for {grid.name} yet. The yearly layers come from{' '}
            <span className="t-data">pipeline/run.py</span>; the monthly series needs:
          </p>
          <p className="t-data alertsPanel__cmd">python pipeline/monthly.py {region}</p>
        </div>
      ) : (
        <>
          <div className="cover__now">
            <span className="t-figure cover__pct">{current.vegPct?.toFixed(1)}%</span>
            <span className="t-unit">
              of ground vegetated in {monthLabel(current.period)}
              {current.scenes ? `, from ${current.scenes} scenes` : ''}
            </span>
          </div>

          <div
            className="cover__chart"
            role="img"
            aria-label={`Vegetated cover by month, ${lo.toFixed(0)} to ${hi.toFixed(0)} percent across ${months.length} months`}
          >
            {(doc.periods ?? []).map((p) =>
              p.usable ? (
                <button
                  key={p.period}
                  type="button"
                  className={`cover__bar ${p.period === current.period ? 'is-active' : ''}`}
                  style={{ height: `${18 + (((p.vegPct ?? 0) - lo) / span) * 82}%` }}
                  title={`${monthLabel(p.period)}: ${p.vegPct}% · ${p.scenes} scenes`}
                  aria-label={`Show ${monthLabel(p.period)}, ${p.vegPct} percent`}
                  onClick={() => setMonth(p.period)}
                />
              ) : (
                // A month we could not read. Drawn at its true position so the
                // shape of the year stays honest, and titled with the reason.
                <span
                  key={p.period}
                  className="cover__gapbar"
                  title={`${monthLabel(p.period)} — ${p.reason}`}
                />
              )
            )}
          </div>
          <div className="cover__axis t-unit">
            <span>{monthLabel(doc.periods[0].period)}</span>
            <span>{monthLabel(doc.periods[doc.periods.length - 1].period)}</span>
          </div>

          {/* The only honest year-on-year comparison a monthly series can make. */}
          {prior ? (
            <p className="cover__change t-data">
              {(current.vegPct ?? 0) - (prior.vegPct ?? 0) >= 0 ? '+' : ''}
              {((current.vegPct ?? 0) - (prior.vegPct ?? 0)).toFixed(1)} points
              <span className="t-unit"> against {monthLabel(prior.period)}</span>
            </p>
          ) : (
            <p className="t-unit cover__extra">
              No reading for {monthLabel(current.period).slice(0, 3)} a year earlier,
              so there is nothing to compare this month against.
            </p>
          )}

          <p className="t-unit cover__caveat">
            This is <strong>the season</strong>, not loss. Vegetation here moves with
            the monsoon and the winter rain — this series swings{' '}
            {lo.toFixed(0)}–{hi.toFixed(0)}% within the year, far more than it moves
            between years. Compare a month with the same month, never with the one
            before it.
          </p>

          <MonthlyGaps doc={doc} />

          {area && (
            <p className="t-unit cover__pending">
              The monthly figures are for the whole of {grid.name}. A drawn area is
              only recomputed on the yearly cadence.
            </p>
          )}
        </>
      )}
    </aside>
  )
}

/** What we could not see, and why. A third of the year, and it needs saying. */
function MonthlyGaps({ doc }: { doc: MonthlyDoc }) {
  const { smog, thin, partial } = blindSpots(doc)
  const total = smog + thin + partial
  if (!total) return null

  const parts = [
    smog && `${smog} in smog season`,
    thin && `${thin} with too few scenes to composite`,
    partial && `${partial} only partly visible`,
  ].filter(Boolean)

  return (
    <p className="t-unit cover__pending">
      {total} of {doc.periods.length} months carry no reading: {parts.join(', ')}.
      Nov–Feb aerosol and the monsoon are why, and they are the reason this is a
      series with holes rather than a smooth line.
    </p>
  )
}
