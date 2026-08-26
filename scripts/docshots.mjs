/**
 * Captures the images the README and PRODUCT doc embed.
 *
 *   node scripts/docshots.mjs        (dev server must be running)
 *
 * Framed deliberately: each shot has to make one point on its own, because in
 * a README nobody gets to click anything.
 *
 * Written as JPEG, not PNG. These are screenshots of satellite imagery and map
 * rasters — photographic content that PNG stores terribly. The PNG set came to
 * 9 MB and GitHub's image proxy would not serve the hero at all; the same eight
 * frames as JPEG are a fraction of that and visually identical at this size.
 */
const QUALITY = 82
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const OUT = 'docs/images'
const URL = 'http://localhost:5173/'
const settle = (p, ms = 3000) => p.waitForTimeout(ms)

/**
 * Changing only the hash does not reload a single-page app, so the mount effect
 * that reads the URL never re-runs and the page silently stays where it was.
 * Reload explicitly, then step past the overture if it is showing.
 */
const go = async (page, hash) => {
  await page.goto(URL + hash, { waitUntil: 'networkidle', timeout: 90_000 })
  await page.reload({ waitUntil: 'networkidle', timeout: 90_000 })
  await settle(page, 5200)
  const enter = page.getByRole('button', { name: 'Open the workspace' })
  if (hash && (await enter.count())) {
    await enter.click()
    await settle(page, 3200)
  }
}

const click = (page, name) => page.getByRole('button', { name }).click()

const shot = (page, name, fullPage = false) =>
  page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: QUALITY, fullPage })

const run = async () => {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

  // 1. The opening claim.
  await go(page, '')
  await settle(page, 4200)
  await shot(page, '01-overture')

  // 2. Priority over imagery, list open — the product in one frame.
  await go(page, '#r=model-town&v=priority&y=2025&t=dark&b=satellite')
  await settle(page)
  await shot(page, '02-priority')

  // 3. A site selected: every figure traceable.
  const first = page.locator('.row').first()
  if (await first.count()) {
    await first.click()
    await settle(page, 3200)
    await shot(page, '03-site')
  }

  // 4. Heat, no panels, so the field itself is the subject.
  await go(page, '#r=model-town&v=heat&y=2025&t=dark&b=satellite')
  await click(page, /^Heat/)
  await settle(page)
  await page.keyboard.press('l')
  await settle(page, 1200)
  await shot(page, '04-heat')

  // 5. Canopy over imagery — the green lands on the real trees.
  await click(page, /^Canopy/)
  await settle(page, 3400)
  await shot(page, '05-canopy')

  // 6. Population.
  await click(page, /^People/)
  await settle(page, 3200)
  await shot(page, '06-people')

  // 7. Light theme on the vector basemap — the other half of the design.
  await go(page, '#r=gulberg&v=priority&y=2025&t=light&b=map')
  await settle(page, 3600)
  await shot(page, '07-light')

  // 8. The Method screen, full length.
  await go(page, '#r=model-town&v=priority&y=2025&t=dark&b=map')
  await click(page, /^Method/i)
  await settle(page, 1600)
  await shot(page, '08-method', true)

  await browser.close()
  console.log(`Wrote doc images to ${OUT}/`)
  if (errors.length) {
    console.log('page errors:', [...new Set(errors)].slice(0, 3))
    process.exitCode = 1
  } else {
    console.log('No page errors.')
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
