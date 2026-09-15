/**
 * Where does the time go before the map is usable?
 *
 *   node scripts/budget.mjs        (dev server must be running)
 *   node scripts/budget.mjs --3g
 *
 * .claude/skills/map-performance/SKILL.md sets the budgets this reports against:
 * first interactive map under 2 s, total initial transfer under 3 MB, and zero
 * third-party runtime requests. It also says to measure rather than trust that
 * it felt fine locally — this is that measurement.
 *
 * Grouped by origin and kind, because the answer has repeatedly turned out to be
 * something other than the data files: a bundle, a font handshake, or basemap
 * imagery can each cost more than every measurement we ship.
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.CHHAON_ORIGIN ?? 'http://localhost:5173'
const THROTTLE = process.argv.includes('--3g')

const FAST_3G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`

const kindOf = (url, type) => {
  const u = new URL(url)
  if (u.origin !== ORIGIN) return `third-party: ${u.host}`
  if (u.pathname.startsWith('/data/')) return 'our data'
  if (type === 'script' || u.pathname.endsWith('.mjs') || u.pathname.endsWith('.tsx')
    || u.pathname.endsWith('.ts') || u.pathname.endsWith('.js')) return 'our javascript'
  if (type === 'stylesheet' || u.pathname.endsWith('.css')) return 'our css'
  return 'our other'
}

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

  if (THROTTLE) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', FAST_3G)
  }

  const seen = []
  page.on('response', async (r) => {
    let size = 0
    try {
      const h = r.headers()
      size = Number(h['content-length'] ?? 0) || (await r.body().catch(() => ({ length: 0 }))).length || 0
    } catch {
      size = 0
    }
    seen.push({ url: r.url(), kind: kindOf(r.url(), r.request().resourceType()), size, t: Date.now() })
  })

  const t0 = Date.now()
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
  await page.getByRole('button', { name: 'Open the workspace' }).click()

  // A DOM signal, not `window.__map` — that is only exposed in dev, so a
  // production run would sit here until the timeout and report the timeout as
  // the load time. Ranked rows on screen means the measurements parsed and
  // rendered, which is what "usable" means to the person looking at it.
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll('.sitelist__rows li, .msheet .row').length > 0 &&
        !!document.querySelector('.maplibregl-canvas'),
      null,
      { timeout: 180_000 }
    )
    .catch(() => console.log('(never became usable within 180s)'))
  const usableAt = Date.now()

  console.log(`${THROTTLE ? 'Fast 3G' : 'unthrottled'}: measurements on screen at ` +
    `${((usableAt - t0) / 1000).toFixed(1)}s\n`)

  const upto = seen.filter((r) => r.t <= usableAt)
  const groups = new Map()
  for (const r of upto) {
    const g = groups.get(r.kind) ?? { n: 0, bytes: 0, last: 0 }
    g.n++
    g.bytes += r.size
    g.last = Math.max(g.last, r.t)
    groups.set(r.kind, g)
  }

  console.log('Before the map was usable, by kind:')
  const rows = [...groups.entries()].sort((a, b) => b[1].bytes - a[1].bytes)
  for (const [kind, g] of rows) {
    console.log(
      `  ${kind.padEnd(28)} ${String(g.n).padStart(4)} req  ${kb(g.bytes).padStart(9)}` +
        `   last at ${((g.last - t0) / 1000).toFixed(1)}s`
    )
  }
  const total = upto.reduce((s, r) => s + r.size, 0)
  console.log(`  ${'TOTAL'.padEnd(28)} ${String(upto.length).padStart(4)} req  ${kb(total).padStart(9)}`)

  console.log('\nTen largest single responses before usable:')
  for (const r of [...upto].sort((a, b) => b.size - a.size).slice(0, 10)) {
    console.log(`  ${kb(r.size).padStart(9)}  ${r.url.replace(ORIGIN, '').slice(0, 96)}`)
  }

  const third = upto.filter((r) => r.kind.startsWith('third-party'))
  console.log(`\nThird-party requests on the critical path: ${third.length}` +
    (third.length ? ` (${kb(third.reduce((s, r) => s + r.size, 0))})` : ''))

  await browser.close()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
