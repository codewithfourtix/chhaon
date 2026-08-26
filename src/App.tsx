import { MapCanvas } from './map/MapCanvas'
import { BasemapToggle, InstrumentRail, LoadingBar, ThermalScale, YearScrubber } from './ui/Chrome'
import { SitePlate } from './ui/SitePlate'
import { Overture } from './ui/Overture'
import { Methodology } from './ui/Methodology'
import { MapBoundary } from './ui/MapBoundary'
import { useApp } from './state/store'
import './styles/app.css'

export default function App() {
  const stage = useApp((s) => s.stage)

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
          <YearScrubber />
          <SitePlate />
          <LoadingBar />
        </>
      )}

      {stage === 'methodology' && <Methodology />}
    </div>
  )
}
