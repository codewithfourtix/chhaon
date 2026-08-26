/**
 * Captures the images the README and PRODUCT doc embed.
 *
 *   node scripts/docshots.mjs        (dev server must be running)
 *
 * Framed deliberately: each shot has to make one point on its own, because in
 * a README nobody gets to click anything.
 */
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

const run = async () => {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

  // 1. The opening claim.
  await go(page, '')
  await settle(page, 4200)
  await page.screenshot({ path: `${OUT}/01-overture.png` })

  // 2. Priority over imagery, list open — the product in one frame.
  await go(page, '#r=model-town&v=priority&y=2025&t=dark&b=satellite')
  await settle(page)
  await page.screenshot({ path: `${OUT}/02-priority.png` })

  // 3. A site selected: every figure traceable.
  const first = page.locator('.row').first()
  if (await first.count()) {
    await first.click()
    await settle(page, 3200)
    await page.screenshot({ path: `${OUT}/03-site.png` })
  }

  // 4. Heat, no panels, so the field itself is the subject.
  await go(page, '#r=model-town&v=heat&y=2025&t=dark&b=satellite')
  await click(page, /^Heat/)
  await settle(page)
  await page.keyboard.press('l')
  await settle(page, 1200)
  await page.screenshot({ path: `${OUT}/04-heat.png` })

  // 5. Canopy over imagery — the green lands on the real trees.
  await click(page, /^Canopy/)
  await settle(page, 3400)
  await page.screenshot({ path: `${OUT}/05-canopy.png` })

  // 6. Population.
  await click(page, /^People/)
  await settle(page, 3200)
  await page.screenshot({ path: `${OUT}/06-people.png` })

  // 7. Light theme on the vector basemap — the other half of the design.
  await go(page, '#r=gulberg&v=priority&y=2025&t=light&b=map')
  await settle(page, 3600)
  await page.screenshot({ path: `${OUT}/07-light.png` })

  // 8. The Method screen, full length.
  await go(page, '#r=model-town&v=priority&y=2025&t=dark&b=map')
  await click(page, /^Method/i)
  await settle(page, 1600)
  await page.screenshot({ path: `${OUT}/08-method.png`, fullPage: true })

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
