import { useEffect, useMemo, useState } from 'react'
import { useRegionData } from '../data/useRegionData'
import { useApp } from '../state/store'

/** Share of cells with NDVI at or above the vegetation threshold, that year. */
function vegFraction(grid: NonNullable<ReturnType<typeof useRegionData>['grid']>, year: number) {
  const g = grid.ndvi[String(year)]
  if (!g) return null
  let seen = 0
  let veg = 0
  for (const v of g) {
    if (v === null) continue
    seen++
    if (v / 100 >= 0.3) veg++
  }
  return seen ? veg / seen : null
}

/**
 * The cold open. The map is already live behind this and already scrubbing.
 * Every figure here is measured, not asserted.
 */
export function Overture() {
  const enter = useApp((s) => s.enterWorkspace)
  const setYear = useApp((s) => s.setYear)
  const { grid } = useRegionData('model-town')
  const [i, setI] = useState(0)

  const years = useMemo(() => grid?.years ?? [], [grid])

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!years.length) return
    if (reduced) {
      setI(0)
      setYear(years[0])
      return
    }
    let n = years.length - 1
    setI(n)
    setYear(years[n])
    const t = setInterval(() => {
      n -= 1
      if (n < 0) {
        clearInterval(t)
        return
      }
      setI(n)
      setYear(years[n])
    }, 900)
    return () => clearInterval(t)
  }, [years, reduced, setYear])

  const first = years[0]
  const last = years[years.length - 1]
  const vFirst = grid && first ? vegFraction(grid, first) : null
  const vLast = grid && last ? vegFraction(grid, last) : null
  const change = vFirst !== null && vLast !== null ? (vLast - vFirst) * 100 : null

  const progress = years.length > 1 ? 1 - i / (years.length - 1) : 0

  return (
    <div className="overture">
      <div className="overture__inner">
        <p className="overture__mark t-urdu" lang="ur" dir="rtl">چھاؤں</p>

        <h1 className="t-plate-title overture__title">
          Where Lahore<br />lost its shade.
        </h1>

        <p className="overture__line t-body">
          Chhaon measures green cover across Model Town, Gulberg and DHA from
          satellite imagery, prices each loss in degrees of surface heat, and
          ranks where planting would do the most good &mdash; and what to plant there.
        </p>

        {change !== null && (
          <p className="overture__line t-body">
            In Model Town, green cover went from{' '}
            <span className="t-data">{(vFirst! * 100).toFixed(0)}%</span> of ground in{' '}
            <span className="t-data">{first}</span> to{' '}
            <span className="t-data">{(vLast! * 100).toFixed(0)}%</span> in{' '}
            <span className="t-data">{last}</span>.
          </p>
        )}

        <div className="overture__meter" aria-hidden="true">
          <span className="overture__meterfill" style={{ transform: `scaleX(${progress})` }} />
        </div>

        <p className="overture__year t-data">
          {years.length ? years[i] : '····'}{' '}
          <span className="t-unit">{years.length ? `of ${last}` : 'loading imagery'}</span>
        </p>

        <button type="button" className="overture__enter" onClick={enter}>
          Open the workspace
        </button>
      </div>
    </div>
  )
}
