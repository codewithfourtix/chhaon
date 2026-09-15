/**
 * End-to-end checks for the features that carry state of their own.
 *
 *   node scripts/features.mjs        (dev server must be running)
 *
 * These exist because each of them can fail in a way that still looks fine on
 * screen: a report that saves but never renders a marker, a watch that stores
 * but never evaluates, a query that parses but sets nothing. So every check ends
 * by reading back the thing the user would have to notice was missing.
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.CHHAON_ORIGIN ?? 'http://localhost:5173'

let failed = false
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`)
  if (!ok) failed = true
}

/**
 * Reach the workspace. The overture is skipped when the URL hash already carries
 * state — which it does after a reload — so the button is not always there.
 */
const enterWorkspace = async (page) => {
  const enter = page.getByRole('button', { name: 'Open the workspace' })
  if (await enter.count()) await enter.click()
  await page.waitForTimeout(3500)
}

const rendered = (page, layer) =>
  page.evaluate(
    (l) => (window.__map?.getLayer(l)
      ? window.__map.queryRenderedFeatures({ layers: [l] }).length
      : -1),
    layer
  )

/**
 * The part of the map no panel is sitting on.
 *
 * Measured rather than guessed. The map is full-bleed with chrome floating over
 * it, so a drag aimed at "the middle" can easily start on a panel and end on the
 * ranked list — in which case MapLibre never sees the mousedown or the mouseup and
 * the test fails for a reason that has nothing to do with the feature. The centre
 * of the viewport is kept inside the result, because that is where the camera
 * puts whatever it just flew to.
 */
const freeMapRect = async (page) => {
  const r = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      return b.width && b.height ? b : null
    }
    const map = box('.map-canvas')
    let left = 0
    let right = map.width
    let top = 0
    let bottom = map.height

    // Left-edge chrome: rail and whichever tool panel is open.
    for (const sel of ['.rail', '.alertsPanel', '.reportPanel', '.costPanel', '.airPanel', '.cover']) {
      const b = box(sel)
      if (b && b.left < map.width * 0.5) left = Math.max(left, b.right)
    }
    // Right-edge chrome: ranked list and the thermal scale.
    for (const sel of ['.sitelist', '.listHandle', '.scale']) {
      const b = box(sel)
      if (b && b.right > map.width * 0.5) right = Math.min(right, b.left)
    }
    // Top and bottom chrome.
    for (const sel of ['.tools', '.segmented', '.cmd']) {
      const b = box(sel)
      if (b) top = Math.max(top, b.bottom)
    }
    const bar = box('.bottombar')
    if (bar) bottom = Math.min(bottom, bar.top)

    return { left, right, top, bottom }
  })
  const pad = 24
  return {
    x1: r.left + pad,
    y1: r.top + pad,
    x2: r.right - pad,
    y2: r.bottom - pad,
  }
}

/* -------------------------------------------------------------- reporting */

const testReporting = async (page) => {
  console.log('\nCitizen reporting')
  await page.getByRole('button', { name: /^Report/ }).click()
  await page.waitForTimeout(400)

  const panel = page.locator('.reportPanel')
  check(await panel.isVisible(), 'report panel opens')

  // Nothing may claim a report was sent or actioned.
  const copy = (await panel.innerText()).toLowerCase()
  const liars = ['authorities have been', 'has been reported to', 'we have notified',
    'government has been alerted', 'submitted to the']
  check(!liars.some((p) => copy.includes(p)), 'no copy claims anyone was notified')
  check(copy.includes('this device'), 'says plainly that a report is local until exported')

  // Arm placement and drop a pin near the middle of the map.
  await page.getByRole('button', { name: /place it on the map/ }).click()
  const r = await freeMapRect(page)
  await page.mouse.click((r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2)
  await page.waitForTimeout(700)

  check(await page.locator('.reportForm').isVisible(), 'placing a pin opens the form')

  // One input serves both routes: a phone opens the camera, a laptop the file
  // picker. `capture` is what makes the camera the default on mobile.
  const photo = await page.evaluate(() => {
    const i = document.querySelector('.reportForm input[type=file]')
    return i ? { accept: i.accept, capture: i.getAttribute('capture') } : null
  })
  check(photo?.accept === 'image/*', `photos accept any image (${photo?.accept})`)
  check(photo?.capture === 'environment', 'and a phone opens the rear camera directly')
  const pendingMarks = await rendered(page, 'reports-pending')
  check(pendingMarks === 1, `the unsaved pin renders on the map (got ${pendingMarks})`)

  await page.getByRole('button', { name: 'Fire or burning' }).click()
  await page.locator('.reportForm textarea').fill('Verification run — burning waste beside the canal.')
  await page.locator('.reportForm input[type="text"]').fill('qa')
  await page.getByRole('button', { name: 'Save to this device' }).click()
  await page.waitForTimeout(1200)

  const rows = await page.locator('.reportLog__item').count()
  check(rows >= 1, `the saved report appears in the log (${rows} row(s))`)
  const marks = await rendered(page, 'reports-marks')
  check(marks >= 1, `the saved report renders as a marker (got ${marks})`)
  check(
    (await page.locator('.reportPanel__warn').count()) >= 1,
    'the draft is labelled as not public'
  )

  // It must survive a reload — that is the whole point of storing it.
  await page.reload({ waitUntil: 'networkidle' })
  await enterWorkspace(page)
  await page.getByRole('button', { name: /^Report/ }).click()
  await page.waitForTimeout(900)
  const afterReload = await page.locator('.reportLog__item').count()
  check(afterReload >= 1, `the report survives a reload (${afterReload} row(s))`)

  // Opening the row should reveal the detail and the complaint route.
  await page.locator('.reportLog__row').first().click()
  await page.waitForTimeout(400)
  check(
    await page.locator('.reportLog__detail').first().isVisible(),
    'opening a log row shows its detail'
  )
  const portal = await page.locator('.reportLog__detail a[href*="citizenportal.gov.pk"]').count()
  check(portal >= 1, 'the detail offers the Citizen Portal route')

  // Clean up, so repeated runs do not pile up drafts.
  await page.getByRole('button', { name: 'Delete' }).first().click()
  await page.waitForTimeout(800)
}

/* ------------------------------------------------- report location routes */

/**
 * Both ways of putting a report on the ground.
 *
 * Takes its own browser contexts, because each case needs a different geolocation
 * permission and a different simulated fix, and Playwright fixes those per context.
 *
 * The accuracy radius is the point of most of these. A coordinate published without
 * it overstates what the log knows: browser geolocation on a laptop is often
 * wifi-derived and kilometres out, and even a real GPS fix can be wider than the
 * 60 m cell the analysis works in.
 */
const testReportLocation = async (browser) => {
  console.log('\nReport location: device fix and map')

  const open = async (ctx) => {
    const page = await ctx.newPage()
    await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle', timeout: 90_000 })
    await enterWorkspace(page)
    await page.getByRole('button', { name: /^Report/ }).click()
    await page.waitForTimeout(600)
    return page
  }
  const at = (latitude, longitude, accuracy) => ({
    viewport: { width: 1500, height: 950 },
    permissions: ['geolocation'],
    geolocation: { latitude, longitude, accuracy },
  })

  // Both routes must be offered before either is used.
  let ctx = await browser.newContext(at(31.4805, 74.3239, 18))
  let page = await open(ctx)
  check(
    (await page.getByRole('button', { name: /Use my current location/ }).count()) === 1 &&
      (await page.getByRole('button', { name: /place it on the map/ }).count()) === 1,
    'both location routes are offered'
  )

  // A good fix inside the region: accepted, shown with its radius, no caveat.
  await page.getByRole('button', { name: /Use my current location/ }).click()
  await page.waitForTimeout(3000)
  const coord = await page.locator('.reportForm__at').innerText()
  check(await page.locator('.reportForm').isVisible(), 'an accurate fix opens the form')
  check(/±18\s*m/.test(coord), `the accuracy radius is shown (${coord.replace(/\n/g, ' ')})`)
  check(
    (await page.locator('.reportForm__caution').count()) === 0,
    'a fix tighter than one cell carries no caveat'
  )
  check(
    (await page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['reports-pending'] }).length)) === 1,
    'the located pin renders on the map'
  )
  check(
    (await page.evaluate(() => window.__map.getZoom())) >= 15.5,
    'the camera flies in so the reporter can check the position against the ground'
  )
  await ctx.close()

  // A coarse fix is usable but must say what it cannot claim.
  ctx = await browser.newContext(at(31.4805, 74.3239, 1400))
  page = await open(ctx)
  await page.getByRole('button', { name: /Use my current location/ }).click()
  await page.waitForTimeout(2500)
  const caution = await page.locator('.reportForm__caution').innerText().catch(() => '')
  check(/1400\s*m/.test(caution) && /not a tree/.test(caution),
    'a kilometre-wide fix says it is a neighbourhood, not a tree')
  await ctx.close()

  // Outside the mapped area: refused rather than pinned where the map cannot show it.
  ctx = await browser.newContext(at(24.8607, 67.0011, 20))  // Karachi
  page = await open(ctx)
  await page.getByRole('button', { name: /Use my current location/ }).click()
  await page.waitForTimeout(2500)
  check(
    /outside the mapped area/i.test(await page.locator('.reportForm__err').innerText().catch(() => '')),
    'a fix outside Lahore is refused'
  )
  check((await page.locator('.reportForm').count()) === 0, 'and no form is opened for it')
  await ctx.close()

  // Refused permission must degrade to the map, not dead-end.
  ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
  await ctx.grantPermissions([])
  page = await open(ctx)
  await page.getByRole('button', { name: /Use my current location/ }).click()
  await page.waitForTimeout(4000)
  const denied = await page.locator('.reportForm__err').innerText().catch(() => '')
  check(/permission/i.test(denied), `a refusal is explained (${denied.slice(0, 54)})`)
  check(
    (await page.getByRole('button', { name: /place it on the map/ }).count()) === 1,
    'and the map route is still there'
  )
  await ctx.close()
}

/* ------------------------------------------------- change detection + watches */

/**
 * A FIXTURE, not data. Served by route interception so the alert path can be
 * exercised without inventing satellite observations and committing them to
 * public/data — the app must never ship numbers nobody measured.
 *
 * Shaped exactly like pipeline/recent.py's output, including a smog-season pass
 * marked unusable, so the UI is tested against the real contract.
 */
const RECENT_FIXTURE = {
  region: 'model-town',
  name: 'Model Town',
  generated: '2026-09-12T00:00:00+00:00',
  windowDays: 120,
  thresholds: { dropNdvi: 0.15, wasVegetated: 0.3, minCells: 3, minCoverage: 0.6 },
  smogMonths: [11, 12, 1, 2],
  passes: [
    { id: 'f1', date: '2026-09-08', cloud: 3.1, usable: true, reason: null, coverage: 0.98, vegPct: 31.2, meanNdvi: 0.24 },
    { id: 'f2', date: '2026-08-29', cloud: 8.4, usable: true, reason: null, coverage: 0.95, vegPct: 33.8, meanNdvi: 0.26 },
    { id: 'f3', date: '2026-08-14', cloud: 62, usable: false, reason: 'only 41% of the area visible', coverage: 0.41, vegPct: null, meanNdvi: null },
    { id: 'f4', date: '2026-01-12', cloud: 12, usable: false, reason: 'smog season (Nov-Feb): aerosol depresses NDVI scene-wide', coverage: null, vegPct: null, meanNdvi: null },
  ],
  latestUsable: '2026-09-08',
  usableCount: 2,
  events: [
    {
      id: 'fx-ev-big', lon: 74.3239, lat: 31.4805, cells: 11, areaM2: 39600,
      beforeNdvi: 0.62, afterNdvi: 0.14, dropNdvi: 0.48,
      beforeDate: '2026-08-29', afterDate: '2026-09-08', severity: 'severe',
    },
    {
      id: 'fx-ev-small', lon: 74.3300, lat: 31.4850, cells: 4, areaM2: 14400,
      beforeNdvi: 0.51, afterNdvi: 0.29, dropNdvi: 0.22,
      beforeDate: '2026-08-29', afterDate: '2026-09-08', severity: 'notable',
    },
  ],
}

const testEmptyChangeState = async (page) => {
  console.log('\nChange panel, with no recent-pass data')

  // Forced with a 404 rather than relying on the file being absent: once
  // `recent.py` has been run for real the data exists, and a test that depended on
  // its absence would quietly stop testing the empty state.
  await page.route('**/data/*-recent.json', (route) => route.fulfill({ status: 404 }))
  await page.reload({ waitUntil: 'networkidle' })
  await enterWorkspace(page)

  await page.getByRole('button', { name: /^Change/ }).click()
  await page.waitForTimeout(900)
  const text = await page.locator('.alertsPanel').innerText()
  check(/recent.py/.test(text), 'names the command that would produce the data')
  check(
    !/no (canopy )?loss (was )?detected/i.test(text),
    'does not imply nothing was lost when nothing was processed'
  )
  await page.getByRole('button', { name: /^Change/ }).click()
  await page.waitForTimeout(300)
  await page.unroute('**/data/*-recent.json')
}

const testChangeAndWatches = async (page) => {
  console.log('\nChange detection and watches (fixture-driven)')
  await page.route('**/data/model-town-recent.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(RECENT_FIXTURE) })
  )
  // The loader memoises per region, so reload to pick the fixture up.
  await page.reload({ waitUntil: 'networkidle' })
  await enterWorkspace(page)

  await page.getByRole('button', { name: /^Change/ }).click()
  await page.waitForTimeout(1200)

  const panel = page.locator('.alertsPanel')
  const text = await panel.innerText()
  check(/2 usable pass/.test(text) || /Last clear look/.test(text), 'reports when the ground was last seen')
  check(/smog/i.test(text), 'says a pass was skipped for smog season')
  check((await page.locator('.passStrip__row .passStrip__tick').count()) === 4, 'every pass is shown, usable or not')
  check((await page.locator('.eventList__item').count()) >= 2, 'both detected clusters are listed')
  check(/3\.96 ha|5\.40 ha/.test(text), 'states the flagged area in hectares')

  // Events must be on the map only while this panel is open.
  const marks = await rendered(page, 'loss-marks')
  check(marks === 2, `both losses render on the map (got ${marks})`)

  // Clicking an event flies the camera to it.
  const before = await page.evaluate(() => window.__map.getCenter().lng)
  await page.locator('.eventList__row').first().click()
  await page.waitForTimeout(2200)
  const after = await page.evaluate(() => window.__map.getZoom())
  check(after >= 15, `selecting a loss zooms in to see the ground (z${after.toFixed(1)})`)
  void before

  // Draw a watch box. It must start to the RIGHT of the panel: the panel sits
  // over the left third of the map, so a drag begun there lands on the panel and
  // never reaches MapLibre. The camera is still centred on the first event after
  // the fly above, so this box contains both.
  await page.getByRole('button', { name: /Draw an area to watch/ }).click()
  const r = await freeMapRect(page)
  await page.mouse.move(r.x1, r.y1)
  await page.mouse.down()
  await page.mouse.move(r.x2, r.y2, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(900)

  const addBtn = page.getByRole('button', { name: 'Watch this area' })
  check(await addBtn.count() > 0, 'a drawn area can be turned into a watch')
  await addBtn.click()
  await page.waitForTimeout(900)

  check((await page.locator('.watchList__item').count()) >= 1, 'the watch is listed')
  const badge = await page.locator('.watchList__badge').first().textContent().catch(() => null)
  check(!!badge && /new/.test(badge), `the watch raises unacknowledged alerts (${badge})`)
  check(
    (await page.locator('.tool__n--alert').count()) >= 1,
    'the tool button is badged with the unseen count'
  )

  // Acknowledging must stop it nagging, without deleting the record.
  await page.getByRole('button', { name: /Mark \d+ as seen/ }).click()
  await page.waitForTimeout(900)
  check((await page.locator('.watchList__badge').count()) === 0, 'acknowledged alerts stop being "new"')
  check(
    (await page.locator('.eventList--inWatch .eventList__item').count()) >= 1,
    'but the events stay in the watch record'
  )

  // No copy may promise a notification, and none may state a cause.
  const copy = (await panel.innerText()).toLowerCase()
  check(!/we will notify|you will be notified|we'll email|sends you an alert/.test(copy),
    'nothing promises a push or an email')
  // A <summary> has no button role, so target the element itself.
  await panel.locator('summary').filter({ hasText: /Will this notify me/ }).click()
  await page.waitForTimeout(300)
  const why = (await panel.innerText()).toLowerCase()
  check(why.includes('not a cause'), 'states that a detected drop is not a cause')

  // Clean up so repeat runs start fresh.
  await page.getByRole('button', { name: 'Remove' }).first().click()
  await page.waitForTimeout(600)
  await page.unroute('**/data/model-town-recent.json')
}

/* ------------------------------------------------------------------- fonts */

/**
 * Self-hosted fonts, and the subsetted Urdu wordmark in particular.
 *
 * Noto Nastaliq Urdu is subsetted to the five letters of چھاؤں to get it from
 * 233 KB to 20 KB. Nastaliq is a joining script whose contextual forms carry the
 * look, so this is the one place where subsetting could plausibly break something
 * while every automated check still passed — the glyphs would silently fall back
 * to a system face and only a human would notice.
 *
 * So this measures the rendered text: a fallback face produces a visibly
 * different advance width for the same string at the same size.
 */
const testFonts = async (page) => {
  console.log('\nFonts')

  const thirdParty = []
  const onReq = (r) => {
    const u = new URL(r.url())
    if (u.origin !== new URL(ORIGIN).origin && !u.protocol.startsWith('data')) {
      thirdParty.push(u.host)
    }
  }
  page.on('request', onReq)
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load', timeout: 90_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1500)
  page.off('request', onReq)

  // Basemap tiles and imagery are third-party by necessity and are fetched by
  // the map, not the document. Fonts must not be.
  const fontHosts = [...new Set(thirdParty)].filter((h) => /font|gstatic|googleapis/.test(h))
  check(fontHosts.length === 0, `no font request leaves the origin (${fontHosts.join(', ') || 'none'})`)

  const loaded = await page.evaluate(() => ({
    urdu: document.fonts.check('1em "Noto Nastaliq Urdu"'),
    archivo: document.fonts.check('1em Archivo'),
    sans: document.fonts.check('1em "IBM Plex Sans"'),
    mono: document.fonts.check('1em "IBM Plex Mono"'),
  }))
  check(loaded.archivo && loaded.sans && loaded.mono, `the three Latin faces loaded (${JSON.stringify(loaded)})`)
  check(loaded.urdu, 'the Urdu face loaded')

  // The wordmark must not be rendering in a fallback.
  const urdu = await page.evaluate(async () => {
    const text = 'چھاؤں'
    await document.fonts.load('400 32px "Noto Nastaliq Urdu"', text)
    const c = document.createElement('canvas').getContext('2d')
    c.font = '32px "Noto Nastaliq Urdu", serif'
    const withFace = c.measureText(text).width
    c.font = '32px serif'
    const fallback = c.measureText(text).width
    const el = document.querySelector('.overture__mark')
    return { withFace, fallback, onScreen: el ? el.getBoundingClientRect().width : 0 }
  })
  check(
    urdu.withFace > 0 && Math.abs(urdu.withFace - urdu.fallback) > 1,
    `the wordmark renders in Nastaliq, not a fallback (${urdu.withFace.toFixed(1)}px vs ${urdu.fallback.toFixed(1)}px fallback)`
  )
  check(urdu.onScreen > 20, `the wordmark has real width on screen (${urdu.onScreen.toFixed(0)}px)`)

  // Archivo is used at font-stretch 112-125%, which needs the wdth axis.
  const stretch = await page.evaluate(() => {
    const el = document.querySelector('.overture__title')
    return el ? getComputedStyle(el).fontStretch : null
  })
  check(stretch !== null, `the display face keeps its width axis (font-stretch: ${stretch})`)

  await enterWorkspace(page)
}

/* ------------------------------------------------------------ legend honesty */

/**
 * The legend must print the range the map is actually painting.
 *
 * `docs/PRODUCT.md` §3.6 claims the map and the legend read the same function so
 * they cannot drift apart. That was true of four views and false of the fifth:
 * Priority's domain comes from the ranking rather than the grid, and the legend
 * printed a hard-coded 0.25–0.95 while the circles were coloured from the real
 * spread — 0.33–0.80 in Model Town, 0.50–0.69 in DHA. Nothing looked broken,
 * which is exactly why it needs a check rather than a comment.
 */
const testLegendMatchesMap = async (page) => {
  console.log('\nLegend matches the painted range')

  // Compared against the region's own sites file, NOT queryRenderedFeatures —
  // that returns only what is inside the viewport, so a zoomed-in camera would
  // report a narrower range and this would fail for the wrong reason. The legend
  // describes the whole region's ramp, which is also why it must not move when
  // you pan.
  const scoresOf = (region) =>
    page.evaluate(async (r) => {
      const res = await fetch(`data/${r}-sites.json`)
      const doc = await res.json()
      const s = doc.features.map((f) => f.properties.score)
      return [Math.min(...s).toFixed(2), Math.max(...s).toFixed(2)]
    }, region)

  const regions = [
    ['Model Town', 'model-town', 'q'],
    ['DHA', 'dha', 'e'],
    ['Iqbal Town', 'iqbal-town', 't'],
  ]

  for (const [label, id, key] of regions) {
    await page.keyboard.press(key)
    await page.waitForTimeout(4000)
    const lo = await page.locator('.scale__tick--lo').innerText()
    const hi = await page.locator('.scale__tick--hi').innerText()
    const [min, max] = await scoresOf(id)
    check(lo === min && hi === max, `${label}: legend ${lo}–${hi} vs scores ${min}–${max}`)
  }

  // The ramp belongs to the region, so zooming must not rescale it.
  const before = await page.locator('.scale__tick--hi').innerText()
  await page.evaluate(() => window.__map.zoomTo(15.5, { duration: 0 }))
  await page.waitForTimeout(1500)
  const after = await page.locator('.scale__tick--hi').innerText()
  check(before === after, `the legend does not rescale on zoom (${before} -> ${after})`)
}

/* ---------------------------------------------------------- text to filter */

const testQueryBar = async (page) => {
  console.log('\nText to filter')
  const bar = page.locator('.cmd')
  check(await bar.isVisible(), 'the command bar is on screen')

  const ask = async (q) => {
    await page.locator('.cmd__input').fill(q)
    await page.locator('.cmd__input').press('Enter')
    await page.waitForTimeout(2200)
  }
  const chips = () => page.locator('.cmd__chip').allInnerTexts()
  const state = () =>
    page.evaluate(() => {
      const h = new URLSearchParams(location.hash.slice(1))
      return { region: h.get('r'), view: h.get('v'), year: h.get('y') }
    })

  // The headline example: one sentence, three pieces of state.
  await ask('show worst hit areas in johar town')
  let s = await state()
  check(s.region === 'johar-town', `region moved to Johar Town (got ${s.region})`)
  check(s.view === 'risk', `"worst hit" selected the Risk view (got ${s.view})`)
  check((await chips()).length >= 2, 'it shows what it understood')

  // A year, and a view that actually uses it.
  await ask('green cover in model town 2018')
  s = await state()
  check(s.region === 'model-town', `region moved to Model Town (got ${s.region})`)
  check(s.view === 'canopy', `"green cover" selected Canopy (got ${s.view})`)
  check(s.year === '2018', `year set to 2018 (got ${s.year})`)

  // Filters on the ranking, including an explicit threshold.
  await ask('neem sites on roadsides serving more than 5000 people')
  // Read the chips, not the whole dropdown: "Ignored: roadsides" also contains
  // the word, so matching on the panel text would pass while the filter was
  // silently dropped.
  const applied = (await chips()).join(' | ').toLowerCase()
  check(applied.includes('neem'), `picked up the species (${applied})`)
  check(applied.includes('roadside'), 'picked up the land use, plural included')
  check(/5,?000/.test(applied), 'picked up the people threshold')
  check(
    /priority/.test(applied) || !/population/.test(applied),
    'the trailing word "people" did not hijack the view'
  )
  const listed = await page.locator('.sitelist__head p').innerText()
  check(/of \d+ shown/.test(listed), `the ranked list actually filtered (${listed.trim()})`)

  // Urdu, which works because this selects rather than generates.
  await ask('گلبرگ میں گرمی')
  s = await state()
  check(s.region === 'gulberg', `Urdu region understood (got ${s.region})`)
  check(s.view === 'heat', `Urdu view understood (got ${s.view})`)

  // A year the pipeline dropped must not be silently snapped to another.
  await ask('canopy in model town 2016')
  const note = (await page.locator('.cmd__drop').innerText()).toLowerCase()
  check(
    note.includes('no usable imagery') || note.includes('closest available'),
    'says when a requested year has no imagery instead of quietly showing another'
  )
  check((await state()).year !== '2016', 'and does not pretend to show it')

  // A question it can only partly use must apply the part it understood AND show
  // what it dropped — otherwise the user believes their question was answered.
  await ask('how many trees are there in lahore altogether')
  const partial = (await page.locator('.cmd__drop').innerText()).toLowerCase()
  check(partial.includes('ignored'), 'lists the words it could not use')
  check(
    !/\b\d{3,}\b/.test(partial),
    'never answers a counting question with a number of its own'
  )

  // Input with nothing actionable must be refused out loud, not silently dropped.
  await ask('explain the historical significance')
  const none = (await page.locator('.cmd__drop').innerText()).toLowerCase()
  check(
    none.includes('does not answer questions') || none.includes('nothing in that matched'),
    'refuses input it cannot turn into map state, rather than doing nothing'
  )
}

/* ------------------------------------------------------------------- run */

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

  await testFonts(page)
  await testReporting(page)
  await testReportLocation(browser)
  await testEmptyChangeState(page)
  await testChangeAndWatches(page)
  await testLegendMatchesMap(page)
  await testQueryBar(page)

  check(errors.length === 0, `no page errors (${[...new Set(errors)].slice(0, 2).join(' | ') || 'none'})`)

  await browser.close()
  console.log(failed ? '\nFAILED' : '\nAll feature checks passed.')
  if (failed) process.exitCode = 1
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
