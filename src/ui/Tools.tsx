import { useMemo } from 'react'
import { estimateCost, formatPkr } from '../data/cost'
import { useRegionData } from '../data/useRegionData'
import { useApp } from '../state/store'
import { IconAir, IconClose, IconMoney, IconSelect } from './icons'

/**
 * Top-level entry points for the three things worth finding fast.
 *
 * Two of the three already existed — area select was a small icon inside the
 * Green cover panel, cost was a field buried in the ranked list. In a demo, a
 * feature a judge cannot find in five seconds may as well not exist, so each
 * now has its own labelled button on the main interface rather than being
 * something you have to already know about.
 */
export function Tools() {
  const drawing = useApp((s) => s.drawing)
  const area = useApp((s) => s.area)
  const setDrawing = useApp((s) => s.setDrawing)
  const setArea = useApp((s) => s.setArea)
  const costOpen = useApp((s) => s.costOpen)
  const toggleCost = useApp((s) => s.toggleCost)
  const airOpen = useApp((s) => s.airOpen)
  const toggleAir = useApp((s) => s.toggleAir)

  return (
    <div className="tools" role="group" aria-label="Tools">
      <button
        type="button"
        className={`tool ${drawing || area ? 'is-on' : ''}`}
        aria-pressed={drawing || !!area}
        title="Draw a box anywhere on the map to analyse just that patch"
        onClick={() => (area ? setArea(null) : setDrawing(!drawing))}
      >
        <IconSelect />
        <span>{area ? 'Clear area' : drawing ? 'Drag a box' : 'Select area'}</span>
      </button>

      <button
        type="button"
        className={`tool ${airOpen ? 'is-on' : ''}`}
        aria-pressed={airOpen}
        title="Particulate capture from the recommended planting"
        onClick={toggleAir}
      >
        <IconAir />
        <span>Air</span>
      </button>

      <button
        type="button"
        className={`tool ${costOpen ? 'is-on' : ''}`}
        aria-pressed={costOpen}
        title="What planting the ranked sites would cost"
        onClick={toggleCost}
      >
        <IconMoney />
        <span>Cost</span>
      </button>
    </div>
  )
}

/**
 * The cost panel, promoted out of the ranked list.
 *
 * The rate is editable because the true figure depends on the department, the
 * season and the contractor — it is a starting point to overwrite, not a claim.
 */
export function CostPanel() {
  const open = useApp((s) => s.costOpen)
  const toggle = useApp((s) => s.toggleCost)
  const region = useApp((s) => s.region)
  const costPkr = useApp((s) => s.costPkr)
  const setCostPkr = useApp((s) => s.setCostPkr)
  const { sites, grid, meta } = useRegionData(region)

  const rm = meta?.regions?.[region]
  const features = useMemo(() => sites?.features ?? [], [sites])
  const est = useMemo(
    () => estimateCost(features.map((f) => f.properties.species.crownM), costPkr),
    [features, costPkr]
  )

  if (!open) return null

  const perTree = est.trees ? est.totalPkr / est.trees : 0
  const co2 = rm?.co2KgPerYear ?? 0
  // What a tonne of CO2 a year costs to buy, at this planting rate. Useful
  // precisely because it is unflattering — see the caveat below.
  const perTonne = co2 > 0 ? est.totalPkr / (co2 / 1000) : null

  return (
    <aside className="costPanel" aria-label="Cost estimate">
      <header className="costPanel__head">
        <div>
          <h2 className="costPanel__title">Cost</h2>
          <p className="t-unit">{grid?.name} · {est.trees} sites</p>
        </div>
        <button type="button" className="iconBtn" onClick={toggle} aria-label="Close cost panel">
          <IconClose />
        </button>
      </header>

      <div className="costPanel__total">
        <span className="t-figure">PKR {formatPkr(est.totalPkr)}</span>
        <span className="t-unit">to plant and establish all {est.trees}</span>
      </div>

      <label className="cost">
        <span className="t-unit">
          Per tree, PKR{' '}
          <input
            type="number"
            min={0}
            step={100}
            value={costPkr}
            onChange={(e) => setCostPkr(Math.max(0, Number(e.target.value)))}
            aria-label="Cost per tree in rupees, including establishment care"
          />
        </span>
        <span className="t-data cost__total">
          avg PKR {Math.round(perTree).toLocaleString('en-PK')}
        </span>
      </label>

      <dl className="costPanel__rows">
        <div>
          <dt className="t-label">Est. CO&#8322; once mature</dt>
          <dd className="t-data">{(co2 / 1000).toFixed(1)} t / yr</dd>
        </div>
        <div>
          <dt className="t-label">Est. PM2.5 captured</dt>
          <dd className="t-data">{(rm?.pm25KgPerYear ?? 0).toFixed(1)} kg / yr</dd>
        </div>
        {perTonne !== null && (
          <div>
            <dt className="t-label">Per tonne CO&#8322; / yr</dt>
            <dd className="t-data">PKR {formatPkr(Math.round(perTonne))}</dd>
          </div>
        )}
      </dl>

      <p className="t-unit costPanel__note">
        The rate is a <strong>starting figure to overwrite</strong> &mdash; a
        sapling plus roughly three years of establishment care. Larger species
        cost more to establish, so the total is weighted by crown size.
      </p>
      <p className="t-unit costPanel__note">
        The cost-per-tonne figure is deliberately unflattering: at this scale
        planting is a <strong>heat and air-quality intervention</strong>, not a
        cheap way to buy carbon. Quoting it honestly is stronger than hiding it.
      </p>
    </aside>
  )
}
