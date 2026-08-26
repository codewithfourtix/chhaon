/**
 * Deterministic screenshots of every Chhaon surface.
 * Used for design review during the build, and for the Devpost submission.
 *
 *   node scripts/shots.mjs [outDir]
 *
 * Requires the dev server on :5173.
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const OUT = process.argv[2] ?? 'shots'
const URL = 'http://localhost:5173/'

// The map animates continuously, so we wait on real signals, then settle.
const settle = (page, ms = 2800) => page.waitForTimeout(ms)

const view = (page, name) =>
  page.getByRole('button', { name: new RegExp(`^${name}`) }).click()

const run = async () => {
  await mkdir(OUT, { recursive: true })
  // System Chrome: real GPU stack, and no bundled-browser download to keep in sync.
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

  // 1. Overture, caught mid-scrub
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90_000 })
  await settle(page, 5000)
  await page.screenshot({ path: `${OUT}/01-overture.png` })

  await page.getByRole('button', { name: 'Open the workspace' }).click()
  await settle(page)

  // 2-5. Each data view
  const views = ['Priority', 'Heat', 'People', 'Canopy']
  for (let i = 0; i < views.length; i++) {
    await view(page, views[i])
    await settle(page)
    await page.screenshot({ path: `${OUT}/0${2 + i}-${views[i].toLowerCase()}.png` })
  }

  // 6. Canopy scrubbed back — the shade retreat, on real NDVI
  const ticks = page.locator('.scrubber__tick')
  if (await ticks.count()) {
    await ticks.first().click()
    await settle(page)
    await page.screenshot({ path: `${OUT}/06-canopy-earliest.png` })
  }

  // 7. Site plate open
  await view(page, 'Priority')
  await settle(page)
  // Click an actual ranked site rather than guessing at the map centre —
  // sites cluster where the ground is hot, which is rarely the middle.
  const box = await page.locator('.map-canvas').boundingBox()
  const pt = await page.evaluate(() => {
    const m = window.__map
    const f = m.querySourceFeatures('sites')[0]
    if (!f) return null
    const p = m.project(f.geometry.coordinates)
    return { x: p.x, y: p.y }
  })
  if (pt) {
    await page.mouse.click(box.x + pt.x, box.y + pt.y)
    await page.waitForTimeout(900)
  }
  if (!(await page.locator('.plate').count())) {
    for (const [dx, dy] of [[0.5, 0.75], [0.45, 0.7], [0.6, 0.72]]) {
      await page.mouse.click(box.x + box.width * dx, box.y + box.height * dy)
      await page.waitForTimeout(700)
      if (await page.locator('.plate').count()) break
    }
  }
  await settle(page, 1200)
  await page.screenshot({ path: `${OUT}/07-site-plate.png` })

  // 8. Satellite
  await page.getByRole('button', { name: /^Satellite/ }).click()
  await settle(page, 4500)
  await page.screenshot({ path: `${OUT}/08-satellite.png` })
  await page.getByRole('button', { name: /^Map$/ }).click()
  await settle(page, 2000)

  // 9. Dark theme
  await page.getByRole('button', { name: /theme$/ }).click()
  await settle(page, 3500)
  await page.screenshot({ path: `${OUT}/09-dark.png` })
  await page.getByRole('button', { name: /theme$/ }).click()
  await settle(page, 3000)

  // 10. Methodology
  await page.getByRole('button', { name: /^Method/ }).click()
  await settle(page, 1200)
  await page.screenshot({ path: `${OUT}/10-method.png`, fullPage: true })
  await page.getByRole('button', { name: 'Back to the map' }).click()
  await settle(page, 1500)

  // 11. Narrow — the rail collapses, the map never does
  await page.setViewportSize({ width: 900, height: 900 })
  await settle(page)
  await page.screenshot({ path: `${OUT}/11-narrow.png` })

  await browser.close()
  console.log(`Wrote screenshots to ${OUT}/`)
  if (errors.length) {
    console.log(`\n${errors.length} page error(s):`)
    for (const e of [...new Set(errors)].slice(0, 5)) console.log('  ' + e)
    process.exitCode = 1
  } else {
    console.log('No page errors.')
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
