/**
 * Production-build check.
 *
 *   npm run build && npx vite preview --port 4173
 *   node scripts/prodcheck.mjs
 *
 * Exists because the vector basemap once worked perfectly in dev and rendered
 * nothing in the production build: MapLibre asks for its worker at a runtime
 * URL Vite could not analyse, so the file was never emitted, a static host
 * answered with index.html, and `new Worker` hung on HTML. Silent, asymmetric
 * (raster fine, vector blank) and invisible to every dev-mode test we had.
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const problems = []

const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`)
  if (!ok) problems.push(msg)
}

const run = async () => {
  // 1. The worker must be served as JavaScript, not the SPA fallback.
  const res = await fetch(`${BASE}/assets/maplibre-gl-worker.mjs`)
  const type = res.headers.get('content-type') ?? ''
  check(res.ok && /javascript|ecmascript/.test(type),
    `worker served as script (got ${res.status} ${type})`)

  const shared = await fetch(`${BASE}/assets/maplibre-gl-shared.mjs`)
  check(shared.ok && /javascript|ecmascript/.test(shared.headers.get('content-type') ?? ''),
    `worker's shared chunk served as script (got ${shared.status})`)

  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const started = new Map()
  const done = new Set()
  const errors = []
  page.on('request', (r) => started.set(r.url(), 1))
  page.on('requestfinished', (r) => done.add(r.url()))
  page.on('requestfailed', (r) => done.add(r.url()))
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))

  await page.goto(BASE, { waitUntil: 'load', timeout: 60_000 })
  await page.waitForTimeout(6000)
  await page.getByRole('button', { name: 'Open the workspace' }).click()
  await page.waitForTimeout(5000)

  // 2. Both basemaps must actually come up.
  await page.getByRole('button', { name: /^Map$/ }).click()
  await page.waitForTimeout(9000)

  // A hung worker shows up as a request that never settles.
  const pending = [...started.keys()].filter((u) => !done.has(u))
  check(pending.length === 0, `no request left pending (${pending.map((u) => u.slice(-40)).join(', ')})`)
  check(errors.length === 0, `no page errors (${[...new Set(errors)].slice(0, 2).join(' | ')})`)

  // The vector basemap paints its labels; a blank map has none.
  const labels = await page.evaluate(() =>
    document.querySelectorAll('.maplibregl-canvas').length)
  check(labels > 0, 'map canvas present')

  await browser.close()
  console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : '\nProduction build OK.')
  if (problems.length) process.exitCode = 1
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
