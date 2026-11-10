// 真机侧截图：adb 拉起 App → 通过 WebView 的 DevTools 协议操作 DOM → adb exec-out screencap 取图。
//   前提：模拟器/真机已连上（adb devices 有设备），APK 已安装，App packageName = com.shijinran.money
//   用法：node tools/shots-android.cjs
//   产物：docs/screenshots/android/01-onboarding.png … 13-success.png
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { outDir, seedTxs, SETTINGS, STORAGE_KEY, sleep } = require('./lib.cjs')

const ADB = process.env.ADB || 'C:/Android/sdk/platform-tools/adb.exe'
const PKG = process.env.APP_ID || 'com.shijinran.money'
const PORT = Number(process.env.CDP_PORT || 9223)
const OUT = outDir('android')

const sh = (c) => execSync(`"${ADB}" ${c}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const screencap = (name) => {
  const buf = execSync(`"${ADB}" exec-out screencap -p`, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
  fs.writeFileSync(path.join(OUT, name), buf)
  console.log('shot', name, buf.length)
}

;(async () => {
  sh('shell am force-stop ' + PKG)
  await sleep(600)
  sh(`shell am start -n ${PKG}/.MainActivity`)
  await sleep(2500)

  const pid = sh(`shell "ps -A | grep ${PKG.split('.').pop()}"`).trim().split(/\s+/)[1]
  try { sh(`forward --remove tcp:${PORT}`) } catch {}
  sh(`forward tcp:${PORT} localabstract:webview_devtools_remote_${pid}`)

  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const target = list.find((t) => t.type === 'page')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })) })
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) console.log('JS ERR', r.result.exceptionDetails.text)
    return r.result?.result?.value
  }
  const click = async (selector, text) => {
    const ok = await evalJs(`(() => {
      const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = ${text ? `nodes.find(n => n.textContent.includes(${JSON.stringify(text)}))` : 'nodes[0]'};
      if (!el) return false; el.click(); return true;
    })()`)
    if (!ok) console.log('MISS', selector, text || '')
    await sleep(650)
    return ok
  }
  const padKey = async (label) => {
    await evalJs(`(() => {
      const el = [...document.querySelectorAll('.qa-pad button')]
        .find(b => (b.textContent || '').trim() === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (el) { el.click(); return true } return false })()`)
    await sleep(120)
  }

  // 01 引导页：清库重载
  await evalJs(`localStorage.clear(); location.reload(); true`)
  await sleep(2200)
  screencap('01-onboarding.png')

  // 写入种子数据（原生输入框是受控组件，直接改 value 不生效，写 storage 最稳）
  await evalJs(`(() => {
    const key = ${JSON.stringify(STORAGE_KEY)};
    const raw = JSON.parse(localStorage.getItem(key) || 'null') || { version: 1, categories: [], settings: {} };
    raw.settings = ${JSON.stringify(SETTINGS)};
    raw.txs = ${JSON.stringify(seedTxs())};
    localStorage.setItem(key, JSON.stringify(raw));
    location.reload(); return true;
  })()`)
  await sleep(2600)
  screencap('02-home.png')

  await evalJs(`document.querySelector('.tab-add').click(); true`)
  await sleep(140)
  screencap('03-morph.png')
  await sleep(700)
  screencap('04-add.png')

  for (const k of ['1', '2', '8', '.', '5']) await padKey(k)
  await padKey('加')
  for (const k of ['4', '5']) await padKey(k)
  await sleep(300)
  screencap('05-add-expression.png')

  await evalJs(`document.querySelector('.qa-save').click(); true`)
  await sleep(1900)
  screencap('13-success.png')
  await sleep(1800)

  screencap('06-home-after-add.png')

  await click('.tab', '统计')
  screencap('07-stats-month.png')
  await click('.segmented button', '周')
  screencap('08-stats-week.png')
  await click('.segmented button', '日')
  screencap('09-stats-day.png')

  await click('.tab', '明细')
  screencap('10-ledger.png')

  await click('.tab', '我的')
  screencap('11-me.png')

  await click('.setting-row', '每月固定支出')
  screencap('12-budget.png')

  const geo = await evalJs(`JSON.stringify({
    w: document.documentElement.clientWidth,
    sw: document.documentElement.scrollWidth,
    fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + '/' + f.weight),
  })`)
  console.log('GEO', geo)
  ws.close()
  process.exit(0)
})().catch((e) => { console.error('FAILED', e); process.exit(1) })
