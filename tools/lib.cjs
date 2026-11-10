// 截图工具的公共部分：定位 playwright、定位项目根目录、确保输出目录存在。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

// 1) 环境变量 PLAYWRIGHT_DIR 指到含 playwright 的 node_modules
// 2) 从项目依赖里找
// 3) 最后去 npx 缓存里翻（用 `npx playwright --version` 跑过一次就会有）
function loadPlaywright() {
  const candidates = []
  if (process.env.PLAYWRIGHT_DIR) candidates.push(path.join(process.env.PLAYWRIGHT_DIR, 'playwright'))
  candidates.push('playwright', 'playwright-core')

  for (const c of candidates) {
    try {
      return require(c)
    } catch {}
  }

  const caches = [
    path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx'),
    path.join(process.env.HOME || '', '.npm', '_npx'),
  ]
  for (const cache of caches) {
    if (!cache || !fs.existsSync(cache)) continue
    for (const dir of fs.readdirSync(cache)) {
      const mod = path.join(cache, dir, 'node_modules', 'playwright')
      if (fs.existsSync(mod)) return require(mod)
    }
  }
  throw new Error('找不到 playwright：先 `npx playwright@1.60 install chrome`，或把 PLAYWRIGHT_DIR 指到它的 node_modules')
}

function outDir(sub) {
  const dir = path.join(ROOT, 'docs', 'screenshots', sub)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// 截图脚本共用的种子数据：2026 年 11 月，20 笔支出 + 1 笔奖金，月薪 12000 / 固定 3500
function seedTxs() {
  const cats = [
    ['food', 4550], ['transport', 1800], ['shopping', 12850], ['food', 3200], ['fun', 6800],
    ['home', 26000], ['health', 4300], ['study', 9900], ['social', 20000], ['pet', 5600],
    ['food', 2750], ['shopping', 6400], ['travel', 32000], ['phone', 5800], ['other', 1200],
    ['food', 3800], ['fun', 4200], ['home', 12000], ['shopping', 8900], ['food', 5100],
  ]
  const notes = ['生鲜买菜', '地铁公交', '秋季外套', '午饭', '电影票', '水电燃气', '感冒药', '网课', '同事婚礼', '猫粮',
    '早餐', '日用品', '周末短途', '话费', '杂项', '晚饭', '剧本杀', '房租补差', '球鞋', '水果']
  const days = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23]
  return cats.map(([categoryId, amount], i) => ({
    id: 'seed' + i, type: 'expense', amount, categoryId, note: notes[i],
    date: `2026-11-${String(days[i]).padStart(2, '0')}`, createdAt: 1700000000000 + i * 1000,
  })).concat([{
    id: 'seed-income', type: 'income', amount: 50000, categoryId: 'bonus', note: '季度奖金',
    date: '2026-11-12', createdAt: 1700000900000,
  }])
}

const SETTINGS = { salary: 1200000, fixedCost: 350000, onboarded: true }
const STORAGE_KEY = 'shijinran.money.v1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = { ROOT, loadPlaywright, outDir, seedTxs, SETTINGS, STORAGE_KEY, sleep }
