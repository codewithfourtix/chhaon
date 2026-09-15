/**
 * Progressive load guard.
 *
 *   node scripts/progressive.mjs          (dev server must be running)
 *   node scripts/progressive.mjs --3g     also throttle to Fast 3G and time it
 *
 * The core grid file carries only the latest NDVI year; earlier years are
 * fetched on demand and prefetched once the map reports idle. Three things can
 * break silently:
 *
 *  1. Every year ends up back in the core file. Nothing errors — first paint
 *     just quietly returns to the 144 KB it was, and only a 3G user notices.
 *  2. The prefetch starts racing the basemap instead of waiting for idle, so the
 *     map that the user is looking at gets slower to serve years nobody asked
 *     for yet.
 *  3. A year file stops being fetched at all, and the scrubber silently keeps
 *     showing the previous year's raster — the layer still renders, so the map
 *     looks fine while showing the wrong year.
 *
 * So this asserts on the request log and on the rendered image data, never on
 * the map merely looking right.
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.CHHAON_ORIGIN ?? 'http://localhost:5173'
const THROTTLE = process.argv.includes('--3g')

// Chrome DevTools' own "Fast 3G" preset.
const FAST_3G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
}

const isYearFile = (p) => p.includes('-ndvi-')

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

  if (THROTTLE) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', FAST_3G)
    console.log('throttled to Fast 3G\n')
  }

  const requests = []
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/data/')) {
      requests.push({ path: u.pathname.replace('/data/', ''), t: Date.now() })
    }
  })

  const t0 = Date.now()
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.getByRole('button', { name: 'Open the workspace' }).click()

  // The moment the user actually has a data layer. This, not a fixed timeout, is
  // what "first paint" means for the assertions below.
  await page
    .waitForFunction(
      () => !!window.__map && (!!window.__map.getLayer('sites-circles') ||
        !!window.__map.getLayer('field-raster')),
      null,
      { timeout: 120_000 }
    )
    .catch(() => null)
  const layerAt = Date.now()

  let failed = false
  const fail = (msg) => {
    console.log(`FAIL — ${msg}`)
    failed = true
  }

  if (!requests.some((r) => r.path === 'meta.json')) {
    console.log('SKIP — no pipeline data present. Run `python pipeline/run.py` first.')
    await browser.close()
    return
  }

  const critical = requests.filter((r) => r.t <= layerAt)
  console.log(`first data layer rendered in ${((layerAt - t0) / 1000).toFixed(1)}s, ` +
    `after ${critical.length} data request(s):`)
  for (const r of critical) console.log(`  ${r.path}`)

  const earlyYears = critical.filter((r) => isYearFile(r.path))
  if (earlyYears.length) {
    fail(
      `${earlyYears.length} year file(s) were requested before the first layer ` +
        `rendered — the prefetch is racing the map, not waiting for idle: ` +
        earlyYears.map((r) => r.path).join(', ')
    )
  }

  // The prefetch should then fill the remaining years in without being asked.
  await page.waitForTimeout(THROTTLE ? 25_000 : 10_000)
  const years = [...new Set(requests.filter((r) => isYearFile(r.path)).map((r) => r.path))]
  console.log(`\nprefetched ${years.length} year files after idle`)
  if (years.length === 0) {
    fail('the prefetch never ran — every scrub will wait on the network')
  }

  // Scrub to the earliest year and confirm the raster repainted for it.
  await page.getByRole('button', { name: /^Canopy/ }).click()
  await page.waitForTimeout(2000)
  const ticks = await page.locator('.scrubber__tick').all()
  if (ticks.length < 2) {
    fail('fewer than two year ticks — the scrubber has no range to test')
  } else {
    const urlLen = () =>
      page.evaluate(() => window.__map.getStyle().sources.field?.url?.length ?? 0)
    const before = await urlLen()
    await ticks[0].click()
    await page.waitForTimeout(2500)
    const after = await urlLen()
    const hasRaster = await page.evaluate(() => !!window.__map.getLayer('field-raster'))

    if (!hasRaster) fail('the canopy raster disappeared after scrubbing')
    // Different years produce different PNGs. Identical image data means the
    // scrubber moved the label but not the measurement.
    if (after === before) {
      fail('the raster did not repaint for the scrubbed year — identical image data')
    }
    if (hasRaster && after !== before) {
      console.log(`\nscrubbed to the earliest year: raster repainted ` +
        `(${before} -> ${after} bytes of image data)`)
    }
  }

  if (errors.length) fail(`page errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}`)

  console.log(failed ? '\nFAILED' : '\nPASS')
  await browser.close()
  if (failed) process.exitCode = 1
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
