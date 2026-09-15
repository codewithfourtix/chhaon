import { useEffect, useMemo, useState } from 'react'
import {
  CITIZEN_PORTAL, KIND_BLURB, KIND_LABEL, REPORT_KINDS, complaintText,
  deleteLocalReport, downloadReportsCsv, exportForPublicLog, localPhoto,
  newReportId, saveLocalReport, shrinkPhoto, type Report, type ReportKind,
} from '../data/reports'
import { useReports } from '../data/useReports'
import { useApp } from '../state/store'
import { IconCheck, IconClose, IconCopy, IconDownload, IconExternal, IconSelect } from './icons'

/**
 * Reporting a felled tree, a fire, or a new planting.
 *
 * The honesty rules from `src/data/reports.ts` are enforced in the copy here,
 * not just in the data layer:
 *
 *  - Nothing on this panel says a report was sent, filed, or actioned. The save
 *    button says "Save to this device", because that is what it does.
 *  - Published and local are visually distinct everywhere, so nobody mistakes a
 *    draft on their phone for a public record.
 *  - The Citizen Portal is offered as a link with copyable text, because that is
 *    the route that has a workflow behind it, and we cannot walk it for them.
 */
export function ReportPanel() {
  const open = useApp((s) => s.reportsOpen)
  const toggle = useApp((s) => s.toggleReports)
  const region = useApp((s) => s.region)
  const placing = useApp((s) => s.placingReport)
  const setPlacing = useApp((s) => s.setPlacingReport)
  const pending = useApp((s) => s.pendingReport)
  const setPending = useApp((s) => s.setPendingReport)
  const changed = useApp((s) => s.reportsChanged)
  const selectedId = useApp((s) => s.selectedReportId)
  const selectReport = useApp((s) => s.selectReport)

  const { published, drafts, publishedAt, loading } = useReports()

  const [kind, setKind] = useState<ReportKind>('felled')
  const [note, setNote] = useState('')
  const [reporter, setReporter] = useState('')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  // A form that stayed filled after saving invites accidental duplicates of the
  // same tree.
  const reset = () => {
    setKind('felled')
    setNote('')
    setPhoto(null)
    setPhotoError(null)
    setPending(null)
  }

  if (!open) return null

  const onSave = async () => {
    if (!pending) return
    setBusy(true)
    try {
      const r: Report = {
        id: newReportId(),
        kind,
        lon: pending.lon,
        lat: pending.lat,
        at: new Date().toISOString(),
        note: note.trim(),
        region,
        reporter: reporter.trim(),
      }
      await saveLocalReport(r, photo)
      reset()
      changed()
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2600)
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Could not save that report')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="reportPanel" aria-label="Citizen reports">
      <header className="costPanel__head">
        <div>
          <h2 className="costPanel__title">Report</h2>
          <p className="t-unit">
            {loading
              ? 'Reading the log…'
              : `${published.length} in the public log · ${drafts.length} on this device`}
          </p>
        </div>
        <button type="button" className="iconBtn" onClick={toggle} aria-label="Close report panel">
          <IconClose />
        </button>
      </header>

      <p className="t-unit reportPanel__why">
        A street tree is smaller than one satellite pixel, so felling one moves
        nothing we measure. This is the only way it enters the record.
      </p>

      {/* ---- capture ---- */}
      {!pending ? (
        <button
          type="button"
          className={`reportPanel__place ${placing ? 'is-on' : ''}`}
          aria-pressed={placing}
          onClick={() => setPlacing(!placing)}
        >
          <IconSelect />
          <span>{placing ? 'Now tap the spot on the map' : 'Place a report on the map'}</span>
        </button>
      ) : (
        <form
          className="reportForm"
          onSubmit={(e) => {
            e.preventDefault()
            void onSave()
          }}
        >
          <p className="t-data reportForm__at">
            {pending.lat.toFixed(5)}, {pending.lon.toFixed(5)}
            <button
              type="button"
              className="reportForm__move t-label"
              onClick={() => {
                setPending(null)
                setPlacing(true)
              }}
            >
              Move
            </button>
          </p>

          <fieldset className="reportForm__kinds">
            <legend className="t-label">What happened</legend>
            {REPORT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={`chip ${kind === k ? 'is-on' : ''}`}
                aria-pressed={kind === k}
                title={KIND_BLURB[k]}
                onClick={() => setKind(k)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </fieldset>
          <p className="t-unit reportForm__blurb">{KIND_BLURB[kind]}</p>

          <label className="reportForm__field">
            <span className="t-label">Detail</span>
            <textarea
              value={note}
              rows={3}
              maxLength={600}
              placeholder="Roughly how many trees, how big, when you noticed."
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <label className="reportForm__field">
            <span className="t-label">Photo</span>
            <input
              type="file"
              accept="image/*"
              // `capture` opens the camera directly on a phone, which is where
              // most of these will be filed.
              capture="environment"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setPhotoError(null)
                try {
                  setPhoto(await shrinkPhoto(file))
                } catch (err) {
                  setPhoto(null)
                  setPhotoError(err instanceof Error ? err.message : 'Could not read that image')
                }
              }}
            />
            {photo && (
              <span className="t-unit reportForm__photook">
                <IconCheck /> {(photo.size / 1024).toFixed(0)} KB, resized and stripped of
                camera metadata
              </span>
            )}
            {photoError && <span className="t-unit reportForm__err">{photoError}</span>}
          </label>

          <label className="reportForm__field">
            <span className="t-label">Your name or handle, optional</span>
            <input
              type="text"
              value={reporter}
              maxLength={80}
              placeholder="Left blank, the report is anonymous"
              onChange={(e) => setReporter(e.target.value)}
            />
          </label>

          <div className="reportForm__acts">
            <button type="submit" className="reportForm__save" disabled={busy}>
              {busy ? 'Saving…' : 'Save to this device'}
            </button>
            <button type="button" className="footBtn" onClick={reset}>
              Discard
            </button>
          </div>
          <p className="t-unit reportForm__caveat">
            This saves <strong>on this device only</strong>. Nobody is notified and
            no department is alerted — there is no API that would make that true.
            Export below to put it in the public log.
          </p>
        </form>
      )}

      {justSaved && (
        <p className="t-unit reportPanel__saved">
          <IconCheck /> Saved on this device. It is not public until it is exported and
          committed.
        </p>
      )}

      {/* ---- the log ---- */}
      {!!drafts.length && (
        <section className="reportPanel__sec">
          <h3 className="t-label">
            On this device · <span className="reportPanel__warn">not public</span>
          </h3>
          <ul className="reportLog">
            {drafts.map((r) => (
              <ReportRow
                key={r.id}
                r={r}
                draft
                selected={r.id === selectedId}
                onSelect={() => selectReport(r.id === selectedId ? null : r.id)}
                onDelete={async () => {
                  await deleteLocalReport(r.id)
                  if (selectedId === r.id) selectReport(null)
                  changed()
                }}
              />
            ))}
          </ul>

          <div className="reportPanel__exports">
            <button
              type="button"
              className="footBtn"
              title="Download reports.json plus each photo, to commit to public/data/"
              onClick={async () => {
                const { reports, photos } = await exportForPublicLog(drafts)
                setPhotoError(null)
                window.alert(
                  `Downloaded reports.json with ${reports} new report(s)` +
                    (photos ? ` and ${photos} photo(s)` : '') +
                    '.\n\nCommit reports.json to public/data/, and any photos to ' +
                    'public/data/reports/. They become public at that point.'
                )
              }}
            >
              <IconDownload />
              <span>Export for the public log</span>
            </button>
            <button
              type="button"
              className="footBtn"
              title="Every report as CSV"
              onClick={() => downloadReportsCsv([...published, ...drafts])}
            >
              <span>CSV</span>
            </button>
          </div>
          <p className="t-unit reportForm__caveat">
            The exported file is already merged with the current public log, so
            committing it cannot drop anyone else&apos;s reports.
          </p>
        </section>
      )}

      <section className="reportPanel__sec">
        <h3 className="t-label">
          The public log
          {publishedAt && <span className="t-unit"> · committed {publishedAt}</span>}
        </h3>
        {published.length ? (
          <ul className="reportLog">
            {published.map((r) => (
              <ReportRow
                key={r.id}
                r={r}
                selected={r.id === selectedId}
                onSelect={() => selectReport(r.id === selectedId ? null : r.id)}
              />
            ))}
          </ul>
        ) : (
          <p className="t-unit">
            Nothing committed yet. Reports appear here once
            <span className="t-data"> public/data/reports.json </span>
            is in the repository — which is what makes the log public, timestamped
            and checkable rather than a promise.
          </p>
        )}
      </section>

      <details className="airPanel__why">
        <summary className="t-label">Does this reach the government?</summary>
        <p className="t-unit">
          No, and we will not pretend otherwise. There is no public API to file
          against, and an email to the Parks &amp; Horticulture Authority is not a
          workflow — it is a message in an inbox.
        </p>
        <p className="t-unit">
          What this gives you instead is a <strong>timestamped public record</strong>{' '}
          that exists whether or not anyone acts on it, and which can be cited.
          For a complaint that does get a tracking number, file it on the Pakistan
          Citizen Portal &mdash; open a report below and copy the text across.
        </p>
        <a
          className="footBtn"
          href={CITIZEN_PORTAL}
          target="_blank"
          rel="noreferrer noopener"
        >
          <IconExternal />
          <span>Pakistan Citizen Portal</span>
        </a>
      </details>
    </aside>
  )
}

/** One row of the log. Published and draft rows are deliberately not identical. */
function ReportRow({
  r,
  draft = false,
  selected,
  onSelect,
  onDelete,
}: {
  r: Report
  draft?: boolean
  selected: boolean
  onSelect: () => void
  onDelete?: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // A draft's photo lives in IndexedDB as a blob; a published one is a committed
  // file. Only fetch the blob once the row is actually opened.
  useEffect(() => {
    if (!selected || !draft || !r.hasLocalPhoto) return
    let revoke: string | null = null
    localPhoto(r.id).then((blob) => {
      if (!blob) return
      revoke = URL.createObjectURL(blob)
      setUrl(revoke)
    })
    return () => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [selected, draft, r.id, r.hasLocalPhoto])

  const when = useMemo(() => new Date(r.at), [r.at])
  const src = draft ? url : r.photo ? `data/${r.photo}` : null

  return (
    <li className={`reportLog__item ${selected ? 'is-open' : ''}`}>
      <button type="button" className="reportLog__row" aria-expanded={selected} onClick={onSelect}>
        <span className={`reportLog__dot reportLog__dot--${r.kind}`} aria-hidden="true" />
        <span className="reportLog__body">
          <span className="reportLog__kind">{KIND_LABEL[r.kind]}</span>
          <span className="t-unit reportLog__meta">
            <time dateTime={r.at}>{when.toLocaleDateString()}</time>
            {' · '}
            {r.lat.toFixed(4)}, {r.lon.toFixed(4)}
            {r.reporter ? ` · ${r.reporter}` : ''}
          </span>
        </span>
      </button>

      {selected && (
        <div className="reportLog__detail">
          {r.note && <p className="t-body reportLog__note">{r.note}</p>}
          {src && <img className="reportLog__photo" src={src} alt={`Reported ${r.kind}`} />}
          <p className="t-unit">
            Recorded <time dateTime={r.at}>{when.toLocaleString()}</time>
            {draft ? ' · on this device only' : ' · in the public log'}
          </p>
          <div className="reportLog__acts">
            <button
              type="button"
              className="footBtn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(complaintText(r))
                } catch {
                  window.prompt('Copy this for a complaint', complaintText(r))
                }
                setCopied(true)
                setTimeout(() => setCopied(false), 1600)
              }}
            >
              {copied ? <IconCheck /> : <IconCopy />}
              <span>{copied ? 'Copied' : 'Copy for a complaint'}</span>
            </button>
            <a
              className="footBtn"
              href={CITIZEN_PORTAL}
              target="_blank"
              rel="noreferrer noopener"
            >
              <IconExternal />
              <span>Citizen Portal</span>
            </a>
            {onDelete && (
              <button type="button" className="footBtn reportLog__del" onClick={onDelete}>
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
