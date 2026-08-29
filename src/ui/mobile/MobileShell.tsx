import { useEffect, useRef, useState } from 'react'
import { REGIONS, SOURCE_RES, UNIT, VIEWS } from '../../data/regions'
import { domainFor } from '../../data/load'
import { RISK_BANDS, riskFor } from '../../data/risk'
import { statsForBox } from '../../data/subarea'
import { estimateCost, formatPkr } from '../../data/cost'
import { downloadGeoJson, downloadSites } from '../../data/exportSites'
import { useRegionData } from '../../data/useRegionData'
import { useApp } from '../../state/store'
import type { ViewId } from '../../data/types'
import {
  IconAir, IconCanopy, IconClose, IconDownload, IconGlobe, IconHeat, IconMethod,
  IconMoney, IconPeople, IconPriority, IconRisk, IconSelect, IconTheme,
} from '../icons'

const VIEW_ICON: Record<ViewId, () => React.ReactElement> = {
  canopy: IconCanopy,
  heat: IconHeat,
  people: IconPeople,
  risk: IconRisk,
  priority: IconPriority,
}

/** Sheet heights as a share of the viewport. */
const PEEK = 0.34
const FULL = 0.82

/**
 * The mobile shell.
 *
 * Not the desktop layout shrunk. On a 390 px phone the rail and the vertical
 * legend alone ate 160 px and left 230 px of map, with the ranked list and the
 * readout hidden entirely — a stripped husk rather than a small version.
 *
 * So mobile gets the layout map apps actually use: the map takes the whole
 * screen, and everything else lives in a bottom sheet you can drag between a
 * peek and nearly full height. The view switcher sits at the top of the sheet so
 * it is reachable in both states, and the tools that matter get thumb-height
 * chips rather than being hidden behind a menu.
 */
export function MobileShell() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const region = useApp((s) => s.region)
  const setRegion = useApp((s) => s.setRegion)
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const basemap = useApp((s) => s.basemap)
  const setBasemap = useApp((s) => s.setBasemap)
  const showMethodology = useApp((s) => s.showMethodology)
  const selectedId = useApp((s) => s.selectedSiteId)

  const [expanded, setExpanded] = useState(false)
  const [regionsOpen, setRegionsOpen] = useState(false)
  const { grid } = useRegionData(region)

  // A site selected on the map should open the sheet, not sit behind it.
  useEffect(() => {
    if (selectedId) setExpanded(true)
  }, [selectedId])

  const height = expanded ? FULL : PEEK
  const regionName = REGIONS.find((r) => r.id === region)?.name

  return (
    <>
      <header className="mtop">
        <span className="mtop__mark t-urdu" lang="ur" dir="rtl">چھاؤں</span>
        <button
          type="button"
          className="mchip mchip--region"
          aria-expanded={regionsOpen}
          onClick={() => setRegionsOpen((v) => !v)}
        >
          {regionName}
          <span aria-hidden="true" className="mchip__caret">▾</span>
        </button>
        <div className="mtop__right">
          <button
            type="button"
            className="mIcon"
            aria-label={basemap === 'map' ? 'Switch to satellite' : 'Switch to map'}
            onClick={() => setBasemap(basemap === 'map' ? 'satellite' : 'map')}
          >
            <IconGlobe />
          </button>
          <button
            type="button"
            className="mIcon"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            onClick={toggleTheme}
          >
            <IconTheme />
          </button>
        </div>
      </header>

      {regionsOpen && (
        <div className="mregions" role="menu">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="menuitemradio"
              aria-checked={region === r.id}
              className={`mregions__item ${region === r.id ? 'is-active' : ''}`}
              onClick={() => {
                setRegion(r.id)
                setRegionsOpen(false)
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      <MobileTools />
      <MobileLegend />

      <Sheet height={height} expanded={expanded} onToggle={() => setExpanded((v) => !v)}>
        <nav className="mtabs" aria-label="View">
          {VIEWS.map((v) => {
            const Icon = VIEW_ICON[v.id]
            return (
              <button
                key={v.id}
                type="button"
                className={`mtab ${view === v.id ? 'is-active' : ''}`}
                aria-current={view === v.id}
                onClick={() => setView(v.id)}
              >
                <Icon />
                <span>{v.name}</span>
              </button>
            )
          })}
        </nav>

        <MobileYear />
        <MobileBody onExpand={() => setExpanded(true)} />

        <footer className="msheet__foot">
          <button type="button" className="footBtn" onClick={showMethodology}>
            <IconMethod />
            <span>Method</span>
          </button>
          <p className="t-unit">
            {grid ? `${SOURCE_RES[view]} · baseline ${grid.baselineC.toFixed(1)}°C` : ''}
          </p>
        </footer>
      </Sheet>
    </>
  )
}

/** Draggable bottom sheet with two snap points. */
function Sheet({
  height, expanded, onToggle, children,
}: {
  height: number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; moved: boolean } | null>(null)

  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, moved: false }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    if (Math.abs(e.clientY - drag.current.y) > 8) drag.current.moved = true
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const dy = e.clientY - d.y
    // A drag decides by direction; a tap just toggles.
    if (!d.moved) return onToggle()
    if (dy < -40 && !expanded) onToggle()
    if (dy > 40 && expanded) onToggle()
  }

  return (
    <section
      ref={ref}
      className="msheet"
      style={{ height: `${height * 100}%` }}
      aria-label="Panel"
    >
      <div
        className="msheet__grab"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
      >
        <span className="msheet__bar" />
      </div>
      <div className="msheet__body">{children}</div>
    </section>
  )
}

function MobileTools() {
  const drawing = useApp((s) => s.drawing)
  const area = useApp((s) => s.area)
  const setDrawing = useApp((s) => s.setDrawing)
  const setArea = useApp((s) => s.setArea)
  const airOpen = useApp((s) => s.airOpen)
  const toggleAir = useApp((s) => s.toggleAir)
  const costOpen = useApp((s) => s.costOpen)
  const toggleCost = useApp((s) => s.toggleCost)

  return (
    <div className="mtools" role="group" aria-label="Tools">
      <button
        type="button"
        className={`mchip ${drawing || area ? 'is-on' : ''}`}
        aria-pressed={drawing || !!area}
        onClick={() => (area ? setArea(null) : setDrawing(!drawing))}
      >
        <IconSelect />
        {area ? 'Clear' : drawing ? 'Drag a box' : 'Area'}
      </button>
      <button
        type="button"
        className={`mchip ${airOpen ? 'is-on' : ''}`}
        aria-pressed={airOpen}
        onClick={toggleAir}
      >
        <IconAir />
        Air
      </button>
      <button
        type="button"
        className={`mchip ${costOpen ? 'is-on' : ''}`}
        aria-pressed={costOpen}
        onClick={toggleCost}
      >
        <IconMoney />
        Cost
      </button>
    </div>
  )
}

/** Horizontal legend — the vertical desktop one would eat a quarter of the screen. */
function MobileLegend() {
  const view = useApp((s) => s.view)
  const region = useApp((s) => s.region)
  const year = useApp((s) => s.year)
  const { grid } = useRegionData(region)
  if (!grid || view === 'priority') return null

  if (view === 'risk') {
    return (
      <div className="mlegend" aria-label="Legend, risk band">
        {RISK_BANDS.map((band, i) => (
          <span key={band} className="mlegend__band">
            <span className="mlegend__sw" style={{ background: `var(--risk-${i + 1})` }} />
            {band}
          </span>
        ))}
      </div>
    )
  }

  const [lo, hi] = domainFor(grid, view, year)
  const dp = view === 'canopy' ? 2 : 0
  const ramp = view === 'canopy' ? 'canopy' : view === 'people' ? 'people' : 'heat'
  return (
    <div className="mlegend" aria-label={`Legend, ${UNIT[view]}`}>
      <span className="t-unit">{lo.toFixed(dp)}</span>
      <span className={`mlegend__ramp mlegend__ramp--${ramp}`} />
      <span className="t-unit">{hi.toFixed(dp)}</span>
      <span className="t-unit mlegend__unit">{UNIT[view]}</span>
    </div>
  )
}

function MobileYear() {
  const year = useApp((s) => s.year)
  const setYear = useApp((s) => s.setYear)
  const region = useApp((s) => s.region)
  const { grid } = useRegionData(region)
  const years = grid?.years ?? []

  useEffect(() => {
    if (years.length && (year === null || !years.includes(year))) {
      setYear(years[years.length - 1])
    }
  }, [years, year, setYear])

  if (years.length < 2) return null

  return (
    <div className="myear">
      <span className="t-label">Year</span>
      <div className="myear__row">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            className={`myear__y ${y === year ? 'is-active' : ''}`}
            aria-current={y === year}
            onClick={() => setYear(y)}
          >
            {String(y).slice(2)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Sheet content, chosen by the active view. */
function MobileBody({ onExpand }: { onExpand: () => void }) {
  const view = useApp((s) => s.view)
  const region = useApp((s) => s.region)
  const area = useApp((s) => s.area)
  const selectedId = useApp((s) => s.selectedSiteId)
  const select = useApp((s) => s.selectSite)
  const costPkr = useApp((s) => s.costPkr)
  const { sites, grid, meta } = useRegionData(region)

  const rm = meta?.regions?.[region]
  const stats = grid ? statsForBox(grid, area) : null

  if (!grid) return <p className="t-unit msheet__note">Loading measurements…</p>

  if (view === 'priority') {
    const feats = sites?.features ?? []
    const est = estimateCost(feats.map((f) => f.properties.species.crownM), costPkr)
    return (
      <>
        <div className="mstats">
          <Stat label="Sites" value={String(feats.length)} />
          <Stat label="Shade worth" value={`${rm?.heatGapC?.toFixed(1) ?? '—'}°C`} accent />
          <Stat label="To plant" value={`PKR ${formatPkr(est.totalPkr)}`} />
        </div>
        <div className="mexports">
          <button type="button" className="footBtn" onClick={() => downloadSites(feats, region)}>
            <IconDownload /><span>CSV</span>
          </button>
          <button type="button" className="footBtn" onClick={() => downloadGeoJson(feats, region)}>
            <IconGlobe /><span>GeoJSON</span>
          </button>
        </div>
        <ul className="mlist">
          {feats.map((f) => {
            const p = f.properties
            const on = p.id === selectedId
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`row ${on ? 'is-active' : ''}`}
                  aria-current={on}
                  onClick={() => {
                    select(on ? null : p.id)
                    onExpand()
                  }}
                >
                  <span className="row__rank t-data">{p.rank}</span>
                  <span className="row__body">
                    <span className="row__top">
                      <span className="row__species">{p.species.common}</span>
                      <span className="row__delta t-data">
                        +{(p.lstC - p.baselineC).toFixed(1)}°C
                      </span>
                    </span>
                    <span className="row__meta t-unit">
                      {p.landuse} · {p.peopleServed.toLocaleString()} people
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </>
    )
  }

  if (view === 'canopy') {
    const series = grid.years
      .map((y) => ({ year: y, pct: stats?.vegPctByYear[y] }))
      .filter((d): d is { year: number; pct: number } => typeof d.pct === 'number')
    const lo = series.length ? Math.min(...series.map((d) => d.pct)) : 0
    const hi = series.length ? Math.max(...series.map((d) => d.pct)) : 1
    const first = series[0]
    const last = series[series.length - 1]
    return (
      <>
        <div className="mstats">
          <Stat
            label={area ? 'Selected area' : grid.name}
            value={last ? `${last.pct.toFixed(1)}%` : '—'}
            accent
          />
          {first && last && (
            <Stat
              label={`${first.year}→${last.year}`}
              value={`${last.pct - first.pct >= 0 ? '+' : ''}${(last.pct - first.pct).toFixed(1)} pts`}
            />
          )}
          {stats && <Stat label="Area" value={`${stats.areaKm2.toFixed(1)} km²`} />}
        </div>
        <div className="cover__chart">
          {series.map((d) => (
            <span
              key={d.year}
              className="cover__bar"
              style={{ height: `${18 + ((d.pct - lo) / Math.max(1, hi - lo)) * 82}%` }}
            />
          ))}
        </div>
        <p className="t-unit msheet__note">
          An observation between two years, <strong>not a trend</strong>. Spring
          vegetation here tracks winter rainfall far more strongly than
          development. See Method.
        </p>
      </>
    )
  }

  const risk = riskFor(grid)
  return (
    <>
      <div className="mstats">
        {view === 'heat' && (
          <Stat label="Baseline" value={`${grid.baselineC.toFixed(1)}°C`} />
        )}
        {view === 'heat' && (
          <Stat label="Shade worth" value={`${rm?.heatGapC?.toFixed(1) ?? '—'}°C`} accent />
        )}
        {view === 'people' && stats?.people != null && (
          <Stat label={area ? 'In area' : 'People'} value={stats.people.toLocaleString()} />
        )}
        <Stat label="High risk" value={`${(risk.summary.elevated * 100).toFixed(0)}%`} />
      </div>
      <p className="t-unit msheet__note">
        {view === 'heat'
          ? 'Landsat surface temperature, mid-morning overpass — not air temperature.'
          : view === 'people'
            ? 'WorldPop 2020 constrained, 100 m grid.'
            : 'Heat and shade deficit, in four fixed bands so a band means the same thing in every region.'}
      </p>
    </>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`mstat ${accent ? 'is-accent' : ''}`}>
      <span className="t-label">{label}</span>
      <span className="t-data">{value}</span>
    </div>
  )
}

export { IconClose }
