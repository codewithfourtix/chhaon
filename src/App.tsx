import { MapCanvas } from './map/MapCanvas'
import { InstrumentRail, ThermalScale, YearScrubber } from './ui/Chrome'
import { SitePlate } from './ui/SitePlate'
import { Overture } from './ui/Overture'
import { MapBoundary } from './ui/MapBoundary'
import { useApp } from './state/store'
import './styles/app.css'

export default function App() {
  const stage = useApp((s) => s.stage)

  return (
    <div className={`app app--${stage}`}>
      {/* The map is permanent. The overture sits on it; it is never remounted. */}
      <MapBoundary>
        <MapCanvas />
      </MapBoundary>

      {stage === 'overture' ? (
        <Overture />
      ) : (
        <>
          <InstrumentRail />
          <ThermalScale />
          <YearScrubber />
          <SitePlate />
        </>
      )}
    </div>
  )
}
