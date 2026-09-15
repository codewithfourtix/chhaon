import type { RegionId } from './types'

/**
 * Citizen reports — ground truth the satellite cannot see.
 *
 * Why this exists at all: at 10 m/px a single street tree is invisible. The
 * whole product says "green cover, never tree canopy" for exactly that reason.
 * A felled 40-year-old sheesham on a residential street moves no pixel we
 * measure, so the only way it enters the record is if a person puts it there.
 *
 * What this deliberately does NOT do
 * ----------------------------------
 * It does not claim anyone is notified. There is no government API to post to,
 * and an email to the PHA is not an action — promising "the authorities have
 * been alerted" would be the single most dishonest thing in this product.
 *
 * What it is instead: a **timestamped public log**. A report is captured on the
 * reporter's own device, exported as a signed-off file, and committed to
 * `public/data/reports.json`, at which point it is public, timestamped, and
 * auditable in git history — a record that exists whether or not any department
 * ever acts on it. Reporters are pointed at the Pakistan Citizen Portal to file
 * the complaint that *does* have a workflow behind it.
 *
 * Two tiers, and the UI never blurs them:
 *   - **the public log** — `public/data/reports.json`, committed, visible to
 *     everyone who opens the app
 *   - **local drafts** — this browser only, not submitted, not visible to anyone
 *     else, and labelled that way everywhere they appear
 */

export const REPORT_KINDS = ['felled', 'fire', 'dieback', 'planted', 'other'] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

export const KIND_LABEL: Record<ReportKind, string> = {
  felled: 'Tree felled',
  fire: 'Fire or burning',
  dieback: 'Dying or diseased',
  planted: 'New planting',
  other: 'Something else',
}

/** What each kind means for the canopy record, stated on the form. */
export const KIND_BLURB: Record<ReportKind, string> = {
  felled: 'A tree cut down or removed',
  fire: 'Waste or vegetation being burned',
  dieback: 'Standing but failing — leaf loss, disease, damage',
  planted: 'A tree planted, by anyone',
  other: 'Anything else worth recording here',
}

export interface Report {
  id: string
  kind: ReportKind
  lon: number
  lat: number
  /** ISO 8601, UTC. The timestamp is the point of the log, so it is never optional. */
  at: string
  note: string
  region: RegionId | null
  /** Optional attribution, free text — never an account, never an email. */
  reporter: string
  /**
   * In the public log: a path relative to `public/data/`, e.g.
   * `reports/cr-1234.jpg`. On a local draft: absent, with the image held in
   * IndexedDB under the report's id.
   */
  photo?: string
  /** Only on a local draft. */
  hasLocalPhoto?: boolean
}

export interface PublicLog {
  generated: string
  reports: Report[]
}

/* --------------------------------------------------------------------------
 * Local storage
 * --------------------------------------------------------------------------
 *
 * IndexedDB rather than localStorage because reports carry photos. A 1280 px
 * JPEG is 100–250 KB and localStorage's ~5 MB quota is shared with everything
 * else, so a handful of reports would start throwing QuotaExceededError — and
 * the throw would land on the one action the user most expects to succeed.
 */

const DB_NAME = 'chhaon-reports'
const DB_VERSION = 1
const STORE = 'reports'
const PHOTOS = 'photos'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB refused to open'))
  })
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = run(t.objectStore(store))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB write failed'))
        t.oncomplete = () => db.close()
      })
  )
}

export async function listLocalReports(): Promise<Report[]> {
  try {
    const all = await tx<Report[]>(STORE, 'readonly', (s) => s.getAll())
    // Newest first: a log is read from the top.
    return all.sort((a, b) => b.at.localeCompare(a.at))
  } catch (e) {
    // Private browsing blocks IndexedDB outright. An empty log is the right
    // degradation — the rest of the product must not go down with it.
    console.error('[reports] local store unavailable', e)
    return []
  }
}

export async function saveLocalReport(r: Report, photo: Blob | null): Promise<void> {
  await tx(STORE, 'readwrite', (s) => s.put({ ...r, hasLocalPhoto: !!photo }))
  if (photo) await tx(PHOTOS, 'readwrite', (s) => s.put(photo, r.id))
}

export async function deleteLocalReport(id: string): Promise<void> {
  await tx(STORE, 'readwrite', (s) => s.delete(id))
  try {
    await tx(PHOTOS, 'readwrite', (s) => s.delete(id))
  } catch {
    // A report with no photo is normal; nothing to clean up.
  }
}

export async function localPhoto(id: string): Promise<Blob | null> {
  try {
    return (await tx<Blob | undefined>(PHOTOS, 'readonly', (s) => s.get(id))) ?? null
  } catch {
    return null
  }
}

/* --------------------------------------------------------------------------
 * The public log
 * -------------------------------------------------------------------------- */

/**
 * Read the committed log. A missing file is the normal state before the team
 * has committed anything, NOT an error — so it resolves to an empty log rather
 * than surfacing a failure the user cannot act on.
 */
export async function loadPublicLog(): Promise<PublicLog> {
  try {
    const res = await fetch('data/reports.json')
    if (!res.ok) return { generated: '', reports: [] }
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('json')) return { generated: '', reports: [] }
    const doc = (await res.json()) as PublicLog
    return { generated: doc.generated ?? '', reports: doc.reports ?? [] }
  } catch {
    return { generated: '', reports: [] }
  }
}

/* --------------------------------------------------------------------------
 * Capture helpers
 * -------------------------------------------------------------------------- */

export const newReportId = () =>
  `cr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/**
 * Shrink a camera photo before it is stored.
 *
 * A phone photo is 3–8 MB, and neither the log nor IndexedDB has any use for
 * that: the job of the image is to show that a tree was standing and is now a
 * stump. 1280 px on the long edge is plenty for that and survives being looked
 * at on a laptop.
 *
 * EXIF is dropped as a side effect of re-encoding through a canvas, which is
 * the right default — a photo destined for a public log should not carry the
 * reporter's camera serial number, and the geotag we keep is the one they placed
 * on the map deliberately.
 */
export async function shrinkPhoto(file: File, maxEdge = 1280): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read that image')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode that image'))),
      'image/jpeg',
      0.72
    )
  })
}

/* --------------------------------------------------------------------------
 * Export, for committing to the public log
 * -------------------------------------------------------------------------- */

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Produce the files the team commits: the merged log, plus each photo.
 *
 * The log is written already merged with whatever is currently public, so
 * committing the downloaded file cannot drop somebody else's entries — the
 * failure mode of "export mine, overwrite theirs" is silent and unrecoverable
 * from the app.
 *
 * Photos come out as `<id>.jpg` for `public/data/reports/`, which is the path
 * each entry's `photo` field points at.
 */
export async function exportForPublicLog(drafts: Report[]): Promise<{ reports: number; photos: number }> {
  const existing = await loadPublicLog()
  const byId = new Map(existing.reports.map((r) => [r.id, r]))

  let photos = 0
  for (const d of drafts) {
    const blob = d.hasLocalPhoto ? await localPhoto(d.id) : null
    const entry: Report = {
      id: d.id,
      kind: d.kind,
      lon: Number(d.lon.toFixed(5)),
      lat: Number(d.lat.toFixed(5)),
      at: d.at,
      note: d.note,
      region: d.region,
      reporter: d.reporter,
      ...(blob ? { photo: `reports/${d.id}.jpg` } : {}),
    }
    byId.set(d.id, entry)
    if (blob) {
      save(blob, `${d.id}.jpg`)
      photos++
    }
  }

  const merged: PublicLog = {
    generated: new Date().toISOString().slice(0, 10),
    reports: [...byId.values()].sort((a, b) => b.at.localeCompare(a.at)),
  }
  save(
    new Blob([JSON.stringify(merged, null, 1)], { type: 'application/json' }),
    'reports.json'
  )
  return { reports: drafts.length, photos }
}

/** CSV, for handing the log to someone who works in a spreadsheet. */
export function reportsToCsv(reports: Report[]): string {
  const headers = ['id', 'kind', 'recorded_at_utc', 'latitude', 'longitude', 'region', 'reporter', 'note', 'photo']
  const cell = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = reports.map((r) =>
    [r.id, r.kind, r.at, r.lat.toFixed(5), r.lon.toFixed(5), r.region ?? '', r.reporter, r.note, r.photo ?? '']
      .map(cell)
      .join(',')
  )
  return [headers.join(','), ...rows].join('\n')
}

export function downloadReportsCsv(reports: Report[]) {
  save(new Blob([reportsToCsv(reports)], { type: 'text/csv;charset=utf-8' }), 'chhaon-reports.csv')
}

/** The complaint route that actually has a workflow behind it. */
export const CITIZEN_PORTAL = 'https://citizenportal.gov.pk/'

/** Text a reporter can paste into a complaint, since we cannot file it for them. */
export function complaintText(r: Report): string {
  return [
    `${KIND_LABEL[r.kind]} — reported ${new Date(r.at).toLocaleString()}`,
    `Location: ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`,
    `https://www.google.com/maps/search/?api=1&query=${r.lat.toFixed(6)},${r.lon.toFixed(6)}`,
    r.note ? `Details: ${r.note}` : '',
    '',
    'Recorded via Chhaon, an open canopy-monitoring tool for Lahore.',
  ]
    .filter(Boolean)
    .join('\n')
}
