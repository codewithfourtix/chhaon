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
const settle = (page, ms = 2600) => page.waitForTimeout(ms)

async function openWorkspace(page) {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 })
  await settle(page, 3200)
  await page.getByRole('button', { name: 'Open the workspace' }).click()
  await settle(page)
}

const run = async () => {
  await mkdir(OUT, { recursive: true })
  // System Chrome: real GPU stack, and no bundled-browser download to keep in sync.
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

  // 1. Overture, caught mid-scrub
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 })
  await settle(page, 4200)
  await page.screenshot({ path: `${OUT}/01-overture.png` })

  // 2-5. Each data view
  await openWorkspace(page)
  for (const view of ['Priority', 'Heat', 'People', 'Canopy']) {
    await page.getByRole('button', { name: new RegExp(`^${view}`) }).click()
    await settle(page)
    await page.screenshot({ path: `${OUT}/0${2 + ['Priority', 'Heat', 'People', 'Canopy'].indexOf(view)}-${view.toLowerCase()}.png` })
  }

  // 6. Site plate open
  await page.getByRole('button', { name: /^Priority/ }).click()
  await settle(page)
  await page.mouse.click(843, 590)
  await settle(page, 1200)
  await page.screenshot({ path: `${OUT}/06-site-plate.png` })

  // 7. Dark theme
  await page.getByRole('button', { name: /theme$/ }).click()
  await settle(page, 3000)
  await page.screenshot({ path: `${OUT}/07-dark.png` })

  // 8. Narrow — the rail collapses, the map never does
  await page.setViewportSize({ width: 900, height: 900 })
  await settle(page)
  await page.screenshot({ path: `${OUT}/08-narrow.png` })

  await browser.close()
  console.log(`Wrote screenshots to ${OUT}/`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
