import { useEffect, useState } from 'react'
import { YEARS } from '../data/regions'
import { useApp } from '../state/store'

/**
 * The cold open. The map is already live behind this; shade is already
 * retreating. No hero headline, no feature grid — the map is the hero.
 */
export function Overture() {
  const enter = useApp((s) => s.enterWorkspace)
  const setYear = useApp((s) => s.setYear)
  const [i, setI] = useState(YEARS.length - 1)

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reduced) {
      setYear(YEARS[0])
      setI(0)
      return
    }
    const t = setInterval(() => {
      setI((prev) => {
        const next = prev - 1
        if (next < 0) {
          clearInterval(t)
          return 0
        }
        setYear(YEARS[next])
        return next
      })
    }, 900)
    return () => clearInterval(t)
  }, [reduced, setYear])

  const progress = 1 - i / (YEARS.length - 1)

  return (
    <div className="overture">
      <div className="overture__inner">
        <p className="overture__mark t-urdu" lang="ur" dir="rtl">چھاؤں</p>

        <h1 className="t-plate-title overture__title">
          Lahore is<br />running out<br />of shade.
        </h1>

        <p className="overture__line t-body">
          Between <span className="t-data">{YEARS[0]}</span> and{' '}
          <span className="t-data">{YEARS[YEARS.length - 1]}</span>, green cover fell across
          Model Town, Gulberg and DHA. Chhaon measures what that cost in degrees,
          then ranks where to plant it back.
        </p>

        <div className="overture__meter" aria-hidden="true">
          <span className="overture__meterfill" style={{ transform: `scaleX(${progress})` }} />
        </div>

        <p className="overture__year t-data">
          {YEARS[i]} <span className="t-unit">of {YEARS[YEARS.length - 1]}</span>
        </p>

        <button type="button" className="overture__enter" onClick={enter}>
          Open the workspace
        </button>
      </div>
    </div>
  )
}
