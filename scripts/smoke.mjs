/**
 * Timing regression guard.
 *
 * Toggling the theme and switching view within ~120ms is the window where a
 * layer update can land between setStyle and style.load. That combination used
 * to strand the map on the previous view with no error. shots.mjs waits 2.6s
 * between actions and will never catch it.
 *
 *   node scripts/smoke.mjs      (dev server must be running)
 */
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chrome' })
const p = await b.newPage({ viewport: { width: 1400, height: 900 } })
p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 200)))
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 })
await p.waitForTimeout(3000)
await p.getByRole('button', { name: 'Open the workspace' }).click()
await p.waitForTimeout(1500)
// Toggle theme then immediately switch view — the exact window that stranded layers.
await p.getByRole('button', { name: /^(Dark|Light)/ }).click()
await p.waitForTimeout(120)
await p.getByRole('button', { name: /^Canopy/ }).click()
await p.waitForTimeout(3500)
const layers = await p.evaluate(() => window.__map.getStyle().layers.filter(l => l.id.startsWith('sites-')).map(l => l.id))
console.log('after fast theme+view switch, layers =', layers)
console.log(layers.includes('sites-canopy') ? 'PASS' : 'FAIL — stranded on old view')
await b.close()
