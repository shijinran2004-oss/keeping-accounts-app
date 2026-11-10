// 电脑上看实时效果：开一个 460×940 的 Chrome 窗口，装上手机视口和一份演示数据，停在「记一笔」面板。
//   先起 dev server（npm run dev），再 `node tools/preview.cjs`；改代码 HMR 会立刻反映，Ctrl-C 结束。
const { loadPlaywright, SETTINGS, STORAGE_KEY } = require('./lib.cjs')

const URL = process.env.PREVIEW_URL || 'http://localhost:5173/'
const { chromium } = loadPlaywright()

;(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--window-position=120,60', '--window-size=460,940'],
  })
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(700)

  if (await page.locator('.ob-start').count()) {
    await page.locator('.ob-field input').nth(0).fill('12000')
    await page.locator('.ob-field input').nth(1).fill('3500')
    await page.locator('.ob-start').click()
    await page.waitForTimeout(800)
  }

  await page.evaluate(({ key, settings }) => {
    const state = JSON.parse(localStorage.getItem(key))
    let n = 0
    const tx = (date, yuan, categoryId, note, type = 'expense') => ({
      id: 'demo-' + ++n, type, amount: Math.round(yuan * 100), categoryId, note, date,
      createdAt: 1700000000000 + n * 1000,
    })
    state.settings = settings
    state.txs = [
      tx('2026-11-10', 28, 'food', '楼下拿铁'), tx('2026-11-10', 32, 'food', '牛肉面'),
      tx('2026-11-09', 156.4, 'shopping', '超市一周'), tx('2026-11-09', 6, 'transport', '地铁'),
      tx('2026-11-08', 76, 'fun', '电影'), tx('2026-11-08', 45, 'transport', '打车回家'),
      tx('2026-11-07', 89, 'study', '一本旧书'), tx('2026-11-06', 128, 'food', '和朋友吃饭'),
      tx('2026-11-06', 23.5, 'food', '早餐'), tx('2026-11-05', 500, 'bonus', '项目奖金', 'income'),
      tx('2026-11-05', 199, 'health', '健身房月卡'), tx('2026-11-04', 299, 'shopping', '一件外套'),
      tx('2026-11-03', 12, 'transport', '公交'), tx('2026-11-03', 58, 'food', '加班晚饭'),
      tx('2026-11-02', 200, 'social', '朋友生日'), tx('2026-11-01', 33, 'food', '早午餐'),
      tx('2026-11-01', 18, 'phone', '话费'), tx('2026-10-30', 64, 'food', '晚饭'),
      tx('2026-10-28', 220, 'shopping', '日用品'), tx('2026-10-25', 80, 'fun', '展览'),
    ]
    localStorage.setItem(key, JSON.stringify(state))
  }, { key: STORAGE_KEY, settings: SETTINGS })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  await page.locator('.tab-add').click()
  await page.waitForTimeout(700)
  for (const k of ['4', '5', '.', '5']) {
    await page.locator('.qa-pad').getByRole('button', { name: k, exact: true }).click()
    await page.waitForTimeout(80)
  }
  console.log(`LIVE PREVIEW READY — ${URL} 停在记一笔面板，点「保存」看出票`)

  // 保活：窗口关掉就结束
  setInterval(() => {}, 1 << 30)
})().catch((e) => { console.error('FAILED', e); process.exit(1) })
