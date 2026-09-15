import { useEffect, useMemo, useState } from 'react'
import { REGIONS } from '../data/regions'
import { coverageNote, daysSince, loadRecent, type LossEvent, type RecentDoc } from '../data/recent'
import {
  evaluate, ha, loadWatches, saveWatches, watchFromArea, type Watch,
} from '../data/watches'
import { useApp } from '../state/store'
import { IconClose, IconPass, IconSelect, IconWatch } from './icons'

/**
 * Recent satellite passes, detected losses, and watched areas.
 *
 * Three things on one surface because they are one story: here is when we last
 * saw the ground, here is what changed since, and here is the place you asked to
 * be told about.
 *
 * The honesty rules:
 *  - **No push.** There is no server, so nothing arrives while the tab is shut.
 *    The panel says that rather than implying a notification.
 *  - **A drop is not a cause.** Felling, fire, harvest, clearance and a mown lawn
 *    look identical from orbit. Every event says what changed and when, never why.
 *  - **Smog season is stated, not hidden.** From November to February the honest
 *    answer is that we cannot see the ground, and a user who is not told that
 *    reads no events as no felling.
 */
export function AlertsPanel() {
  const open = useApp((s) => s.alertsOpen)
  const toggle = useApp((s) => s.toggleAlerts)
  const region = useApp((s) => s.region)
  const area = useApp((s) => s.area)
  const drawing = useApp((s) => s.drawing)
  const setDrawing = useApp((s) => s.setDrawing)
  const setArea = useApp((s) => s.setArea)
  const watchVersion = useApp((s) => s.watchVersion)
  const watchesChanged = useApp((s) => s.watchesChanged)
  const focusEvent = useApp((s) => s.focusEvent)

  const [doc, setDoc] = useState<RecentDoc | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    loadRecent(region).then((d) => {
      if (!live) return
      setDoc(d)
      setLoading(false)
    })
    return () => {
      live = false
    }
  }, [region])

  // watchVersion is the invalidation signal, not an unused dependency:
  // loadWatches() reads localStorage, which the linter cannot see into.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const watches = useMemo(() => loadWatches(), [watchVersion])
  const regionName = REGIONS.find((r) => r.id === region)?.name ?? region

  const alerts = useMemo(
    () =>
      watches
        .filter((w) => w.region === region)
        .map((w) => evaluate(w, doc?.events ?? [])),
    [watches, region, doc]
  )

  if (!open) return null

  const update = (next: Watch[]) => {
    saveWatches(next)
    watchesChanged()
  }

  return (
    <aside className="alertsPanel" aria-label="Recent change and alerts">
      <header className="costPanel__head">
        <div>
          <h2 className="costPanel__title">Change</h2>
          <p className="t-unit">{regionName}</p>
        </div>
        <button type="button" className="iconBtn" onClick={toggle} aria-label="Close change panel">
          <IconClose />
        </button>
      </header>

      {/* ---- what the satellite can currently see ---- */}
      {loading ? (
        <p className="t-unit alertsPanel__note">Reading recent passes…</p>
      ) : !doc ? (
        <div className="alertsPanel__empty">
          <p className="t-unit">
            No recent-pass data for {regionName} yet. The yearly layers come from{' '}
            <span className="t-data">pipeline/run.py</span>; this needs the fast
            rolling stage:
          </p>
          <p className="t-data alertsPanel__cmd">python pipeline/recent.py {region}</p>
          <p className="t-unit">
            Sentinel-2 revisits every ~5 days, so the observations already exist —
            they just have not been processed here.
          </p>
        </div>
      ) : (
        <>
          <div className="alertsPanel__status">
            <span className="alertsPanel__statusIcon" aria-hidden="true"><IconPass /></span>
            <p className="t-unit">{coverageNote(doc)}</p>
          </div>

          <PassStrip doc={doc} />

          {/* ---- detected change ---- */}
          <section className="reportPanel__sec">
            <h3 className="t-label">
              Detected loss
              <span className="t-unit"> · last {doc.windowDays} days</span>
            </h3>

            {doc.events.length ? (
              <>
                <p className="t-unit alertsPanel__note">
                  {doc.events.length} cluster{doc.events.length === 1 ? '' : 's'} where
                  vegetated ground abruptly lost its signal, totalling{' '}
                  <span className="t-data">
                    {ha(doc.events.reduce((s, e) => s + e.areaM2, 0)).toFixed(1)} ha
                  </span>
                  .
                </p>
                <ul className="eventList">
                  {doc.events.slice(0, 12).map((e) => (
                    <EventRow key={e.id} e={e} onGo={() => focusEvent(e.lon, e.lat)} />
                  ))}
                </ul>
                {doc.events.length > 12 && (
                  <p className="t-unit alertsPanel__note">
                    {doc.events.length - 12} more, smallest last.
                  </p>
                )}
              </>
            ) : (
              <p className="t-unit alertsPanel__note">
                {doc.usableCount >= 2
                  ? `Nothing over the threshold since ${doc.passes.find((p) => p.usable)?.date ?? 'the last pass'}. A cluster must be at least ${doc.thresholds.minCells} cells and drop ${doc.thresholds.dropNdvi} NDVI to count.`
                  : 'Not enough usable passes to compare yet — two are needed.'}
              </p>
            )}
          </section>
        </>
      )}

      {/* ---- watches ---- */}
      <section className="reportPanel__sec">
        <h3 className="t-label">Watched areas</h3>

        {area ? (
          <button
            type="button"
            className="alertsPanel__add"
            onClick={() => {
              update([...loadWatches(), watchFromArea(region, regionName, area)])
              setArea(null)
            }}
          >
            <IconWatch />
            <span>Watch this area</span>
          </button>
        ) : (
          <button
            type="button"
            className={`reportPanel__place ${drawing ? 'is-on' : ''}`}
            aria-pressed={drawing}
            onClick={() => setDrawing(!drawing)}
          >
            <IconSelect />
            <span>{drawing ? 'Drag a box on the map' : 'Draw an area to watch'}</span>
          </button>
        )}

        {alerts.length ? (
          <ul className="watchList">
            {alerts.map((a) => (
              <li key={a.watch.id} className="watchList__item">
                <div className="watchList__head">
                  <div className="watchList__id">
                    <p className="watchList__name">{a.watch.name}</p>
                    <p className="t-unit">
                      drop &ge; <span className="t-data">{a.watch.minDropNdvi}</span>,{' '}
                      &ge; <span className="t-data">{a.watch.minCells}</span> cells
                    </p>
                  </div>
                  {a.unseen.length > 0 && (
                    <span className="watchList__badge t-data">{a.unseen.length} new</span>
                  )}
                </div>

                {a.matched.length ? (
                  <>
                    <p className="t-unit watchList__summary">
                      <span className="t-data">{ha(a.areaM2).toFixed(2)} ha</span> flagged
                      across {a.matched.length} cluster{a.matched.length === 1 ? '' : 's'}.
                    </p>
                    <ul className="eventList eventList--inWatch">
                      {a.matched.slice(0, 4).map((e) => (
                        <EventRow
                          key={e.id}
                          e={e}
                          unseen={a.unseen.some((u) => u.id === e.id)}
                          onGo={() => focusEvent(e.lon, e.lat)}
                        />
                      ))}
                    </ul>
                    {!!a.unseen.length && (
                      <button
                        type="button"
                        className="footBtn"
                        onClick={() =>
                          update(
                            loadWatches().map((w) =>
                              w.id === a.watch.id
                                ? {
                                    ...w,
                                    acknowledged: [
                                      ...new Set([...w.acknowledged, ...a.unseen.map((e) => e.id)]),
                                    ],
                                  }
                                : w
                            )
                          )
                        }
                      >
                        <span>Mark {a.unseen.length} as seen</span>
                      </button>
                    )}
                  </>
                ) : (
                  <p className="t-unit watchList__summary">
                    Nothing over this threshold here.
                  </p>
                )}

                <div className="watchList__acts">
                  <button
                    type="button"
                    className="footBtn"
                    onClick={() => setArea(a.watch.area)}
                  >
                    <span>Show area</span>
                  </button>
                  <button
                    type="button"
                    className="footBtn reportLog__del"
                    onClick={() => update(loadWatches().filter((w) => w.id !== a.watch.id))}
                  >
                    <span>Remove</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-unit alertsPanel__note">
            No watched areas in {regionName}. A watch is one place you care about —
            a plot, a green belt, the strip along a canal — not the whole city, so
            that an alert still means something when it comes.
          </p>
        )}
      </section>

      <details className="airPanel__why">
        <summary className="t-label">Will this notify me?</summary>
        <p className="t-unit">
          Not while this tab is closed. Chhaon is a static site with no server, so
          there is nothing to send a push or an email — watches are evaluated when
          you open it. Saying otherwise would be a promise the architecture cannot
          keep.
        </p>
        <p className="t-unit">
          What a watch does give you is a <strong>standing question</strong>: every
          time the pipeline processes a new pass, the answer is waiting here, with
          the dates of the two observations it compared.
        </p>
        <p className="t-unit">
          And a detected drop is <strong>not a cause</strong>. Felling, fire,
          harvest, construction clearance and a mown lawn are indistinguishable
          from orbit. Pair an event with a citizen report to say what happened.
        </p>
      </details>
    </aside>
  )
}

/**
 * Every pass in the window, usable or not.
 *
 * The unusable ones are shown rather than filtered out: a gap the user cannot
 * explain looks like a bug, and "we could not see the ground for six weeks" is
 * itself the finding during smog season.
 */
function PassStrip({ doc }: { doc: RecentDoc }) {
  const passes = doc.passes.slice(0, 18)
  return (
    <div className="passStrip">
      <div className="passStrip__row" role="list" aria-label="Recent satellite passes">
        {passes.map((p) => (
          <span
            key={p.id}
            role="listitem"
            className={`passStrip__tick ${p.usable ? 'is-usable' : 'is-blocked'}`}
            title={
              p.usable
                ? `${p.date} · ${p.cloud}% cloud · ${Math.round((p.coverage ?? 0) * 100)}% visible · ${p.vegPct}% vegetated`
                : `${p.date} · unusable: ${p.reason}`
            }
          />
        ))}
      </div>
      <p className="t-unit passStrip__key">
        <span className="passStrip__tick is-usable" aria-hidden="true" /> usable
        <span className="passStrip__tick is-blocked" aria-hidden="true" /> not usable
        <span className="passStrip__age">
          newest {passes[0]?.date ?? '—'}
        </span>
      </p>
    </div>
  )
}

function EventRow({
  e,
  unseen = false,
  onGo,
}: {
  e: LossEvent
  unseen?: boolean
  onGo: () => void
}) {
  const age = daysSince(e.afterDate)
  return (
    <li className={`eventList__item ${unseen ? 'is-unseen' : ''}`}>
      <button type="button" className="eventList__row" onClick={onGo}>
        <span
          className={`eventList__sev eventList__sev--${e.severity}`}
          aria-hidden="true"
        />
        <span className="eventList__body">
          <span className="eventList__top">
            <span className="eventList__area t-data">{ha(e.areaM2).toFixed(2)} ha</span>
            <span className="t-unit">
              NDVI {e.beforeNdvi.toFixed(2)} &rarr; {e.afterNdvi.toFixed(2)}
            </span>
          </span>
          <span className="t-unit eventList__meta">
            between <time dateTime={e.beforeDate}>{e.beforeDate}</time> and{' '}
            <time dateTime={e.afterDate}>{e.afterDate}</time>
            {age !== null && age >= 0 ? ` · ${age}d ago` : ''}
            {e.severity === 'severe' ? ' · severe' : ''}
          </span>
        </span>
      </button>
    </li>
  )
}
