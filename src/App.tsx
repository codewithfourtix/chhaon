import { MapCanvas } from './map/MapCanvas'
import { BasemapToggle, BottomBar, InstrumentRail, LoadingBar, ThermalScale } from './ui/Chrome'
import { SitePlate } from './ui/SitePlate'
import { SiteList } from './ui/SiteList'
import { CoverTrend } from './ui/CoverTrend'
import { CostPanel, Tools } from './ui/Tools'
import { AirPanel } from './ui/AirPanel'
import { Shortcuts } from './ui/Shortcuts'
import { Overture } from './ui/Overture'
import { Methodology } from './ui/Methodology'
import { MapBoundary } from './ui/MapBoundary'
import { MobileShell } from './ui/mobile/MobileShell'
import { useIsMobile } from './ui/useIsMobile'
import { useApp } from './state/store'
import { useAppShortcuts, useUrlState } from './state/useAppShortcuts'
import './styles/app.css'

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
          <MobileShell />
          <SitePlate />
          <CostPanel />
          <AirPanel />
          <LoadingBar />
        </>
      )}

      {stage === 'workspace' && !mobile && (
        <>
          <InstrumentRail />
          <BasemapToggle />
          <Tools />
          <ThermalScale />
          <BottomBar />
          <SiteList />
          <CoverTrend />
          <CostPanel />
          <AirPanel />
          <SitePlate />
          <Shortcuts />
          <LoadingBar />
        </>
      )}

      {stage === 'methodology' && <Methodology />}
    </div>
  )
}
