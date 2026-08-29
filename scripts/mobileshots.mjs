/**
 * Mobile screenshots, on a real phone viewport with touch emulation.
 *
 *   node scripts/mobileshots.mjs [outDir]     (dev server must be running)
 *
 * Also asserts the two things that quietly break a phone layout: horizontal
 * overflow, and tap targets too small for a thumb.
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const OUT = process.argv[2] ?? 'docs/images'
const URL = 'http://localhost:5173/'
const IPHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
}

const shot = (p, name) =>
  p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 80 })

const run = async () => {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome' })
  const ctx = await browser.newContext(IPHONE)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)))

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90_000 })
  await page.waitForTimeout(5500)
  await shot(page, 'm1-overture')

  await page.getByRole('button', { name: 'Open the workspace' }).tap()
  await page.waitForTimeout(4000)
  await shot(page, 'm2-priority')

  await page.getByRole('button', { name: /^Canopy/ }).tap()
  await page.waitForTimeout(3200)
  await page.locator('.msheet__grab').tap()
  await page.waitForTimeout(900)
  await shot(page, 'm3-canopy')

  await page.getByRole('button', { name: /^Priority/ }).tap()
  await page.waitForTimeout(2200)
  await page.locator('.msheet__grab').tap()
  await page.waitForTimeout(800)
  const row = page.locator('.mlist .row').first()
  if (await row.count()) {
    await row.tap()
    await page.waitForTimeout(2600)
  }
  await shot(page, 'm4-site')

  // --- assertions ---
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  )
  // Map attribution links are excluded: they are a licence obligation at a
  // conventional size, not primary interface.
  const small = await page.evaluate(() => {
    const bad = []
    for (const el of document.querySelectorAll('button, [role="button"]')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      if (r.height < 34) bad.push(`${el.className || el.tagName} ${Math.round(r.height)}px`)
    }
    return bad
  })

  console.log('horizontal overflow:', overflow)
  console.log('tap targets under 34px:', small.length ? small.slice(0, 5) : 'none')
  console.log('page errors:', errors.length ? [...new Set(errors)].slice(0, 3) : 'none')
  await browser.close()

  if (overflow || small.length || errors.length) process.exitCode = 1
  else console.log('\nMobile OK.')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
