import { useMemo } from 'react'
import { useRegionData } from '../data/useRegionData'
import { useApp } from '../state/store'

/**
 * Observed vegetated cover, year by year.
 *
 * This panel is one line of caveat away from contradicting the product's most
 * important claim. The Method screen says plainly that no monotonic trend was
 * found and that Lahore's year-to-year vegetated share tracks winter rainfall
 * far more strongly than development. A bare "−4.2% since 2017" printed without
 * that would undo it.
 *
 * So the change figure is labelled as an *observation between two years*, never
 * as a trend, and the caveat sits under it rather than behind a tooltip.
 */
export function CoverTrend() {
  const region = useApp((s) => s.region)
  const view = useApp((s) => s.view)
  const year = useApp((s) => s.year)
  const setYear = useApp((s) => s.setYear)
  const { meta, grid } = useRegionData(region)

  const rm = meta?.regions?.[region]
  const series = useMemo(() => {
    if (!rm?.vegPctByYear || !grid) return []
    return grid.years
      .map((y) => ({ year: y, pct: rm.vegPctByYear[String(y)] }))
      .filter((d): d is { year: number; pct: number } => typeof d.pct === 'number')
  }, [rm, grid])

  if (view !== 'canopy' || series.length < 2) return null

  const lo = Math.min(...series.map((d) => d.pct))
  const hi = Math.max(...series.map((d) => d.pct))
  const span = Math.max(1, hi - lo)
  const first = series[0]
  const last = series[series.length - 1]
  const change = last.pct - first.pct
  const current = series.find((d) => d.year === year) ?? last

  return (
    <aside className="cover" aria-label="Observed vegetated cover by year">
      <header className="cover__head">
        <h2 className="cover__title">Green cover</h2>
        <p className="t-unit">{grid?.name}</p>
      </header>

      <div className="cover__now">
        <span className="t-figure cover__pct">{current.pct.toFixed(1)}%</span>
        <span className="t-unit">of ground vegetated in {current.year}</span>
      </div>

      <div className="cover__chart" role="img"
        aria-label={`Vegetated cover from ${first.pct.toFixed(1)}% in ${first.year} to ${last.pct.toFixed(1)}% in ${last.year}`}>
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
        {change >= 0 ? '+' : ''}{change.toFixed(1)} points
        <span className="t-unit"> between {first.year} and {last.year}</span>
      </p>

      <p className="t-unit cover__caveat">
        An observation between two years, <strong>not a trend</strong>. Spring
        vegetation here tracks winter rainfall far more strongly than
        development — the series swings {lo.toFixed(0)}–{hi.toFixed(0)}% with no
        monotonic direction. See Method.
      </p>
    </aside>
  )
}
