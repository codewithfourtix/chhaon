import { useEffect, useState } from 'react'
import { useRegionData } from '../data/useRegionData'
import { useApp } from '../state/store'

/**
 * The cold open. The map is already live behind this and already scrubbing.
 *
 * It leads with the heat gap, not with a loss narrative, because that is what
 * the measurement actually supports: comparing vegetated against bare ground
 * inside a single scene is immune to the year-to-year noise that makes a
 * "canopy is falling" claim unsafe here. See the Method screen.
 */
export function Overture() {
  const enter = useApp((s) => s.enterWorkspace)
  const setYear = useApp((s) => s.setYear)
  const { grid, meta } = useRegionData('model-town')
  const [i, setI] = useState(0)

  const years = grid?.years ?? []
  const rmeta = meta?.regions?.['model-town']

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years.length, reduced])

  const last = years[years.length - 1]
  const progress = years.length > 1 ? 1 - i / (years.length - 1) : 0
  const gap = rmeta?.heatGapC ?? null

  return (
    <div className="overture">
      <div className="overture__inner">
        <p className="overture__mark t-urdu" lang="ur" dir="rtl">چھاؤں</p>

        {gap !== null ? (
          <h1 className="t-plate-title overture__title">
            In Lahore,<br />shade is worth<br />{gap.toFixed(1)}&deg;C.
          </h1>
        ) : (
          <h1 className="t-plate-title overture__title">
            In Lahore,<br />shade is<br />measurable.
          </h1>
        )}

        <p className="overture__line t-body">
          {gap !== null ? (
            <>
              Bare ground in Model Town runs{' '}
              <span className="t-data">{gap.toFixed(1)}&deg;C</span> hotter at the
              surface than well-vegetated ground in the same satellite pass
              {rmeta?.ndviLstCorr != null && (
                <> &mdash; a correlation of{' '}
                  <span className="t-data">{rmeta.ndviLstCorr.toFixed(2)}</span>{' '}
                  across every cell we measured</>
              )}.
            </>
          ) : (
            <>Chhaon measures green cover and surface temperature across three
              Lahore neighbourhoods from open satellite data.</>
          )}
        </p>

        <p className="overture__line overture__line--second t-body">
          Chhaon finds where that shade is missing, works out how many people
          each gap affects, and ranks the ground worth planting &mdash; with a
          species chosen for the site.
        </p>

        <div className="overture__meter" aria-hidden="true">
          <span className="overture__meterfill" style={{ transform: `scaleX(${progress})` }} />
        </div>

        <p className="overture__year t-data">
          {years.length ? years[i] : '····'}{' '}
          <span className="t-unit">
            {years.length ? `green cover, ${years[0]}–${last}` : 'loading imagery'}
          </span>
        </p>

        <button type="button" className="overture__enter" onClick={enter}>
          Open the workspace
        </button>
      </div>
    </div>
  )
}
