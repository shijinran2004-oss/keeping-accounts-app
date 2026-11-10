// 浏览器侧截图：用 Playwright 驱动 Chrome，按 390×844@2x 把每个页面拍一遍。
//   先起 dev server（npm run dev），再 `node tools/shots-web.cjs`
//   产物：docs/screenshots/web/01-onboarding.png … 13-success.png
const path = require('path')
const { loadPlaywright, outDir, seedTxs, SETTINGS, STORAGE_KEY } = require('./lib.cjs')

const URL = process.env.SHOTS_URL || 'http://localhost:5173/'
const OUT = outDir('web')
const { chromium } = loadPlaywright()

const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const ctxOpts = {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
  }

  // 01 引导页：干净的上下文就是全新用户
  const fresh = await browser.newContext(ctxOpts)
  const p0 = await fresh.newPage()
  await p0.goto(URL, { waitUntil: 'networkidle' })
  await p0.waitForTimeout(800)
  await shot(p0, '01-onboarding.png')
  await fresh.close()

  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(URL, { waitUntil: 'networkidle' })

  await page.evaluate(({ txs, settings, key }) => {
    const raw = localStorage.getItem(key)
    const base = raw ? JSON.parse(raw) : { version: 1, categories: [], settings: {} }
    base.settings = settings
    base.txs = txs
    localStorage.setItem(key, JSON.stringify(base))
  }, { txs: seedTxs(), settings: SETTINGS, key: STORAGE_KEY })

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  const tab = async (name) => { await page.locator('.tab', { hasText: name }).click(); await page.waitForTimeout(650) }
  const pad = () => page.locator('.qa-pad')

  await shot(page, '02-home.png')

  await page.locator('.tab-add').click()
  await page.waitForTimeout(700)
  await shot(page, '03-add.png')

  // 算式：128.5 + 45
  for (const k of ['1', '2', '8', '.', '5']) await pad().getByRole('button', { name: k, exact: true }).click()
  await pad().getByRole('button', { name: '加', exact: true }).click()
  for (const k of ['4', '5']) await pad().getByRole('button', { name: k, exact: true }).click()
  await page.waitForTimeout(400)
  await shot(page, '04-add-filled.png')

  // 小票在 1300ms 时还在出票，1900ms 才盖得上章
  await page.locator('.qa-save').click()
  await page.waitForTimeout(1900)
  await shot(page, '13-success.png')
  await page.waitForTimeout(1800)

  await shot(page, '05-home-after-add.png')

  await tab('统计')
  await shot(page, '06-stats-month.png')
  await page.locator('.segmented button', { hasText: '周' }).click()
  await page.waitForTimeout(600)
  await shot(page, '07-stats-week.png')
  await page.locator('.segmented button', { hasText: '日' }).click()
  await page.waitForTimeout(600)
  await shot(page, '08-stats-day.png')

  await tab('明细')
  await shot(page, '09-ledger.png')

  await tab('我的')
  await shot(page, '10-me.png')

  await page.locator('.setting-row', { hasText: '每月固定支出' }).first().click()
  await page.waitForTimeout(700)
  await shot(page, '11-budget.png')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  await tab('首页')
  await page.locator('.tab-add').click()
  await page.waitForTimeout(700)
  await page.locator('.qa-seg button', { hasText: '收入' }).click()
  await page.waitForTimeout(400)
  for (const k of ['5', '0', '0']) await pad().getByRole('button', { name: k, exact: true }).click()
  await page.locator('.qa-chip', { hasText: '奖金' }).first().click()
  await page.waitForTimeout(400)
  await shot(page, '12-add-income.png')

  console.log('ERRORS', JSON.stringify(errors.slice(0, 5)))
  await browser.close()
})()
