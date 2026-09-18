import { useEffect, useMemo, useRef, useState } from 'react'
import { isEmpty, parseQuery, QUERY_EXAMPLES, type QueryResult } from '../data/query'
import { useRegionData } from '../data/useRegionData'
import { useApp } from '../state/store'
import { IconSearch } from './icons'

/**
 * Plain language in, map state out.
 *
 * Not a chatbot, and the difference is the point. It answers by *moving the map*,
 * never by writing sentences about the data — so there is no path by which it can
 * state a figure nobody measured. See src/data/query.ts.
 *
 * Everything it understood is shown back as chips before anything else happens,
 * because a control that silently reinterprets an instruction is worse than one
 * that refuses. The chips are also what make it demo well: the audience watches
 * the sentence become four filters.
 */
export function CommandBar() {
  const [text, setText] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const region = useApp((s) => s.region)
  const { grid, sites } = useRegionData(region)

  const setRegion = useApp((s) => s.setRegion)
  const setView = useApp((s) => s.setView)
  const setYear = useApp((s) => s.setYear)
  const setFilters = useApp((s) => s.setFilters)
  const clearFilters = useApp((s) => s.clearFilters)
  const setBasemap = useApp((s) => s.setBasemap)
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const toggleAlerts = useApp((s) => s.toggleAlerts)
  const toggleReports = useApp((s) => s.toggleReports)
  const toggleCost = useApp((s) => s.toggleCost)
  const toggleAir = useApp((s) => s.toggleAir)

  const species = useMemo(
    () => [...new Set((sites?.features ?? []).map((f) => f.properties.species.common))],
    [sites]
  )

  // `/` focuses the box, the convention everywhere else a search field exists.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      const typing =
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        setOpen(true)
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Closes when you click or tab anywhere else — the map, a panel, the rail.
  // It used to close only on Escape, so once opened it sat over the map for good.
  useEffect(() => {
    if (!open) return
    const outside = (t: EventTarget | null) =>
      !(t instanceof Node && rootRef.current?.contains(t))
    const onPointer = (e: PointerEvent) => {
      if (!outside(e.target)) return
      setOpen(false)
      inputRef.current?.blur()
    }
    const onFocus = (e: FocusEvent) => {
      if (outside(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('focusin', onFocus)
    }
  }, [open])

  const run = () => {
    const r = parseQuery(text, { years: grid?.years, species })
    setResult(r)
    if (isEmpty(r)) return

    // Region first: it resets filters and the selection, so anything else has to
    // be applied after it or it would be wiped.
    if (r.region && r.region !== region) setRegion(r.region)
    if (r.view) setView(r.view)
    if (r.year !== undefined) setYear(r.year)
    if (r.clearFilters) clearFilters()
    if (r.landuse || r.species || r.minPeople !== undefined) {
      setFilters({
        ...(r.landuse ? { landuse: r.landuse } : {}),
        ...(r.species ? { species: r.species } : {}),
        ...(r.minPeople !== undefined ? { minPeople: r.minPeople } : {}),
      })
    }
    if (r.basemap) setBasemap(r.basemap)
    if (r.theme && r.theme !== theme) toggleTheme()
    if (r.open === 'alerts') toggleAlerts()
    if (r.open === 'reports') toggleReports()
    if (r.open === 'cost') toggleCost()
    if (r.open === 'air') toggleAir()
  }

  return (
    <div ref={rootRef} className={`cmd ${open ? 'is-open' : ''}`}>
      <form
        className="cmd__form"
        onSubmit={(e) => {
          e.preventDefault()
          run()
        }}
      >
        <span className="cmd__icon" aria-hidden="true"><IconSearch /></span>
        <input
          ref={inputRef}
          className="cmd__input"
          type="text"
          value={text}
          // lang is unset on purpose: the field takes English and Urdu equally,
          // and dir="auto" makes it flip per what is typed rather than per locale.
          dir="auto"
          placeholder="Ask the map — “worst hit areas in johar town”"
          aria-label="Set the map from a description, in English or Urdu"
          onFocus={() => setOpen(true)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.currentTarget.blur()
              setOpen(false)
            }
          }}
        />
        {!!text && (
          <button
            type="button"
            className="cmd__clear"
            aria-label="Clear"
            onClick={() => {
              setText('')
              setResult(null)
              inputRef.current?.focus()
            }}
          >
            &times;
          </button>
        )}
      </form>

      {open && (
        <div className="cmd__drop">
          {result ? (
            isEmpty(result) ? (
              <>
                <p className="t-unit cmd__none">
                  Nothing in that matched a region, view, year, land use or species.
                  This sets filters — it does not answer questions.
                </p>
                <Examples onPick={setText} />
              </>
            ) : (
              <>
                <p className="t-label cmd__did">Applied</p>
                <ul className="cmd__chips">
                  {result.matched.map((m) => (
                    <li key={`${m.label}:${m.value}`} className="cmd__chip">
                      <span className="t-unit cmd__chipLabel">{m.label}</span>
                      <span className="cmd__chipValue">{m.value}</span>
                    </li>
                  ))}
                </ul>
                {result.notes.map((n) => (
                  <p key={n} className="t-unit cmd__note">{n}</p>
                ))}
                {!!result.ignored.length && (
                  <p className="t-unit cmd__ignored">
                    Ignored: {result.ignored.join(', ')}
                  </p>
                )}
              </>
            )
          ) : (
            <Examples onPick={setText} />
          )}
        </div>
      )}
    </div>
  )
}

function Examples({ onPick }: { onPick: (s: string) => void }) {
  return (
    <>
      <p className="t-label cmd__did">Try</p>
      <ul className="cmd__eg">
        {QUERY_EXAMPLES.map((e) => (
          <li key={e}>
            <button type="button" dir="auto" onClick={() => onPick(e)}>
              {e}
            </button>
          </li>
        ))}
      </ul>
      <p className="t-unit cmd__note">
        It only ever sets what is already on this map — region, view, year, land
        use, species, thresholds. It does not generate text, so it cannot state a
        number that was not measured.
      </p>
    </>
  )
}
