import { MapCanvas } from './map/MapCanvas'
import { BasemapToggle, BottomBar, InstrumentRail, LoadingBar, ThermalScale } from './ui/Chrome'
import { SitePlate } from './ui/SitePlate'
import { SiteList } from './ui/SiteList'
import { Shortcuts } from './ui/Shortcuts'
import { Overture } from './ui/Overture'
import { Methodology } from './ui/Methodology'
import { MapBoundary } from './ui/MapBoundary'
import { useApp } from './state/store'
import { useAppShortcuts, useUrlState } from './state/useAppShortcuts'
import './styles/app.css'

export default function App() {
  const stage = useApp((s) => s.stage)
  useAppShortcuts()
  useUrlState()

  return (
    <div className={`app app--${stage}`}>
      {/* The map is permanent. Other stages sit on it; it is never remounted. */}
      <MapBoundary>
        <MapCanvas />
      </MapBoundary>

      {stage === 'overture' && <Overture />}

      {stage === 'workspace' && (
        <>
          <InstrumentRail />
          <BasemapToggle />
          <ThermalScale />
          <BottomBar />
          <SiteList />
          <SitePlate />
          <Shortcuts />
          <LoadingBar />
        </>
      )}

      {stage === 'methodology' && <Methodology />}
    </div>
  )
}
