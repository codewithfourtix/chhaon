/**
 * Timing regression guard.
 *
 * Toggling the theme and switching view within ~120ms is the window where a
 * layer update can land between setStyle and style.load. That combination used
 * to strand the map on the previous view with no error. shots.mjs waits ~2.8s
 * between actions and will never catch it.
 *
 *   node scripts/smoke.mjs      (dev server must be running)
 */
import { chromium } from 'playwright'

const layerIds = (page) =>
  page.evaluate(() =>
    window.__map
      ? window.__map.getStyle().layers
          .filter((l) => l.id.startsWith('field-') || l.id.startsWith('sites-'))
          .map((l) => l.id)
      : []
  )

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 90_000 })
  await page.waitForTimeout(4000)
  await page.getByRole('button', { name: 'Open the workspace' }).click()
  // Satellite tiles plus 120 sites take longer to settle than the old
  // vector-only default did.
  await page.waitForTimeout(6000)

  // Without pipeline output there are no data layers to strand, so the timing
  // assertion would be vacuous. Say so rather than reporting a false pass.
  const baseline = await layerIds(page)
  if (!baseline.length) {
    console.log('SKIP — no pipeline data present, so there are no data layers to test.')
    console.log('       Run `python pipeline/run.py` first.')
    await browser.close()
    return
  }

  await page.getByRole('button', { name: /theme$/i }).click()
  await page.waitForTimeout(120)
  await page.getByRole('button', { name: /^Canopy/ }).click()
  await page.waitForTimeout(5000)

  const after = await layerIds(page)
  const ok = after.includes('field-raster')
  console.log('after fast theme+view switch, layers =', after)
  console.log(ok ? 'PASS' : 'FAIL — stranded on the old view')

  // Priority must draw every ranked site, not just the labelled ones. An
  // invalid radius expression once left 120 circles rendering as zero.
  await page.getByRole('button', { name: /^Priority/ }).click()
  await page.waitForTimeout(3500)
  const counts = await page.evaluate(() => ({
    circles: window.__map.queryRenderedFeatures({ layers: ['sites-circles'] }).length,
    labels: window.__map.queryRenderedFeatures({ layers: ['sites-rank'] }).length,
  }))
  console.log('priority dots:', counts)
  if (counts.circles < 50) {
    console.log(`FAIL — only ${counts.circles} site dots rendered`)
    process.exitCode = 1
  }
  if (!ok) process.exitCode = 1
  if (errors.length) {
    console.log('page errors:', [...new Set(errors)].slice(0, 3))
  }
  await browser.close()
  if (!ok || errors.length) process.exitCode = 1
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
