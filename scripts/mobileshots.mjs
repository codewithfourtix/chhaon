/**
 * Mobile screenshots, on a real phone viewport with touch emulation.
 *
 *   node scripts/mobileshots.mjs [outDir]     (dev server must be running)
 *
 * Also asserts the things that quietly break a phone layout: horizontal
 * overflow, tap targets too small for a thumb, and chrome landing on top of
 * the call to action.
 *
 * The layout assertions run at three heights, not one. 390x844 is the roomiest
 * phone there is, and running only there is how the attribution bar came to
 * sit directly on the overture button at 390x664 — an iPhone in Safari, once
 * the browser chrome is accounted for — while this script reported OK.
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

// The screenshot pass runs on the roomiest phone; the assertions run on all
// three, because the tight ones are where chrome starts colliding.
const SIZES = [
  [390, 844],
  [390, 664],
  [360, 640],
]

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
  let bad = overflow || small.length > 0 || errors.length > 0

  // The overture, at the heights a real phone actually gives a page.
  for (const [w, h] of SIZES) {
    const c = await browser.newContext({ ...IPHONE, viewport: { width: w, height: h } })
    const q = await c.newPage()
    await q.goto(URL, { waitUntil: 'networkidle', timeout: 90_000 })
    await q.waitForTimeout(4500)
    const r = await q.evaluate(() => {
      const btn = document.querySelector('.overture__enter')
      const attrib = document.querySelector('.maplibregl-ctrl-attrib')
      if (!btn || !attrib) return { missing: true }
      const b = btn.getBoundingClientRect()
      const a = attrib.getBoundingClientRect()
      // Probe the button's centre and mid-edges, not its corners: it is a pill,
      // so its corners legitimately fall outside its own rounded shape.
      const probes = [
        [b.x + b.width / 2, b.y + b.height / 2],
        [b.x + 18, b.y + b.height / 2],
        [b.right - 18, b.y + b.height / 2],
        [b.x + b.width / 2, b.y + 3],
        [b.x + b.width / 2, b.bottom - 3],
      ]
      const covered = probes
        .map(([x, y]) => document.elementFromPoint(x, y))
        .filter((el) => el !== btn && !btn.contains(el))
        .map((el) => el?.className || el?.tagName || 'null')
      return {
        boxOverlap: !(
          b.right <= a.left || b.left >= a.right || b.bottom <= a.top || b.top >= a.bottom
        ),
        covered,
        clearance: Math.round(a.top - b.bottom),
      }
    })
    const ok = !r.missing && !r.boxOverlap && r.covered.length === 0
    console.log(
      `overture ${w}x${h}:`,
      ok ? `clear (${r.clearance}px above attribution)` : JSON.stringify(r)
    )
    if (!ok) bad = true
    await c.close()
  }

  await browser.close()

  if (bad) process.exitCode = 1
  else console.log('\nMobile OK.')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
