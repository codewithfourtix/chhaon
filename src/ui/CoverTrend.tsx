import { useMemo } from 'react'
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
  const theme = useApp((s) => s.theme)
  const setYear = useApp((s) => s.setYear)
  const area = useApp((s) => s.area)
  const drawing = useApp((s) => s.drawing)
  const setArea = useApp((s) => s.setArea)
  const setDrawing = useApp((s) => s.setDrawing)
  const { grid } = useRegionData(region)

  // Recomputed over whichever cells the drawn box contains — no new data, and
  // the same arithmetic the whole-region figure uses.
  const stats = useMemo(() => (grid ? statsForBox(grid, area) : null), [grid, area])

  const series = useMemo(() => {
    if (!stats || !grid) return []
    return grid.years
      .map((y) => ({ year: y, pct: stats.vegPctByYear[y] }))
      .filter((d): d is { year: number; pct: number } => typeof d.pct === 'number')
  }, [stats, grid])

  if (view !== 'canopy' || !grid) return null

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
              {stats.meanLstC !== null && <>Mean surface {stats.meanLstC.toFixed(1)}°C. </>}
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
            downloadGeoPng(grid, 'canopy', year, {
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
