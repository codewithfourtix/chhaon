import { lazy, Suspense } from 'react'
import { MapCanvas } from './map/MapCanvas'
import { BasemapToggle, BottomBar, InstrumentRail, LoadingBar, ThermalScale } from './ui/Chrome'
import { SitePlate } from './ui/SitePlate'
import { SiteList } from './ui/SiteList'
import { CoverTrend } from './ui/CoverTrend'
import { CostPanel, Tools } from './ui/Tools'
import { AirPanel } from './ui/AirPanel'
import { ReportPanel } from './ui/ReportPanel'
import { AlertsPanel } from './ui/AlertsPanel'
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

export default function App() {
  const stage = useApp((s) => s.stage)
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
          <ReportPanel />
          <AlertsPanel />
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
          <ReportPanel />
          <AlertsPanel />
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
