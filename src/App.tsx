import { lazy, Suspense } from 'react'
import { MapCanvas } from './map/MapCanvas'
import { BasemapToggle, BottomBar, InstrumentRail, LoadingBar, ThermalScale } from './ui/Chrome'
import { SitePlate } from './ui/SitePlate'
import { SiteList } from './ui/SiteList'
import { CoverTrend } from './ui/CoverTrend'
import { CostPanel, Tools } from './ui/Tools'
import { AirPanel } from './ui/AirPanel'

import { CommandBar } from './ui/CommandBar'
import { Shortcuts } from './ui/Shortcuts'
import { Overture } from './ui/Overture'
import { MapBoundary } from './ui/MapBoundary'
import { useIsMobile } from './ui/useIsMobile'
import { useApp } from './state/store'
import { useAppShortcuts, useUrlState } from './state/useAppShortcuts'
import './styles/app.css'

/**
 * Two surfaces are split out of the first-paint bundle.
 *
 * Neither is on the critical path — Method is a screen you navigate to, and a
 * desktop session never renders the mobile shell or the reverse — but both were
 * being downloaded before the map could draw. Measured with
 * `node scripts/budget.mjs --3g`, which reports what is actually on the critical
 * path rather than what feels heavy.
 *
 * No Suspense fallback spinner on purpose: the map is already on screen
 * underneath, and per .claude/skills/map-ui/SKILL.md a skeleton over the map is
 * worse than a brief nothing.
 */
const Methodology = lazy(() =>
  import('./ui/Methodology').then((m) => ({ default: m.Methodology }))
)
const MobileShell = lazy(() =>
  import('./ui/mobile/MobileShell').then((m) => ({ default: m.MobileShell }))
)
const ReportPanel = lazy(() =>
  import('./ui/ReportPanel').then((m) => ({ default: m.ReportPanel }))
)
const AlertsPanel = lazy(() =>
  import('./ui/AlertsPanel').then((m) => ({ default: m.AlertsPanel }))
)

export default function App() {
  const stage = useApp((s) => s.stage)
  const reportsOpen = useApp((s) => s.reportsOpen)
  const alertsOpen = useApp((s) => s.alertsOpen)
  const mobile = useIsMobile()
  useAppShortcuts()
  useUrlState()

  return (
    <div className={`app app--${stage} ${mobile ? 'is-mobile' : ''}`}>
      {/* The map is permanent. Other stages sit on it; it is never remounted. */}
      <MapBoundary>
        <MapCanvas />
      </MapBoundary>

      {stage === 'overture' && <Overture />}

      {stage === 'workspace' && mobile && (
        <>
          <Suspense fallback={null}><MobileShell /></Suspense>
          <SitePlate />
          <CostPanel />
          <AirPanel />
          {reportsOpen && <Suspense fallback={null}><ReportPanel /></Suspense>}
          {alertsOpen && <Suspense fallback={null}><AlertsPanel /></Suspense>}
          <LoadingBar />
        </>
      )}

      {stage === 'workspace' && !mobile && (
        <>
          <InstrumentRail />
          <CommandBar />
          <BasemapToggle />
          <Tools />
          <ThermalScale />
          <BottomBar />
          <SiteList />
          <CoverTrend />
          <CostPanel />
          <AirPanel />
          {reportsOpen && <Suspense fallback={null}><ReportPanel /></Suspense>}
          {alertsOpen && <Suspense fallback={null}><AlertsPanel /></Suspense>}
          <SitePlate />
          <Shortcuts />
          <LoadingBar />
        </>
      )}

      {stage === 'methodology' && (
        <Suspense fallback={null}><Methodology /></Suspense>
      )}
    </div>
  )
}
