#!/usr/bin/env node
/**
 * 目录分层检查：只允许「上层依赖下层」，跨层只能走对方的 index.ts。
 *
 *   types  ←  lib  ←  data  ←  ui  ←  sheets  ←  pages  ←  App
 *
 * 同层文件之间可以互相 import；跨层时不允许 `../lib/money` 这类深层路径。
 * 新增目录时先改 LAYER_OF / ALLOWED，再写代码，避免结构慢慢腐化。
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')

const ALLOWED = {
  lib: [],
  data: ['lib'],
  ui: ['lib'],
  sheets: ['lib', 'data', 'ui'],
  pages: ['lib', 'data', 'ui', 'sheets'],
  app: ['lib', 'data', 'ui', 'sheets', 'pages'],
}

const IGNORE_DIRS = new Set(['assets', 'styles'])
const IMPORT_RE = /(?:from\s+|import\s*\()(['"])(\.[^'"]+)\1/g

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

function layerOf(file) {
  const rel = path.relative(SRC, file).split(path.sep)
  if (rel.length === 1) return ALLOWED[rel[0]] ? rel[0] : 'app' // App.tsx / main.tsx
  return ALLOWED[rel[0]] ? rel[0] : rel[0]
}

const errors = []
for (const file of walk(SRC)) {
  const fromLayer = layerOf(file)
  if (!ALLOWED[fromLayer]) continue
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[2]
    const target = path.resolve(path.dirname(file), spec)
    const rel = path.relative(SRC, target).split(path.sep)
    const toLayer = rel[0] === 'types' ? 'types' : rel[0] === 'assets' ? 'assets' : (ALLOWED[rel[0]] ? rel[0] : 'app')
    if (toLayer === fromLayer) continue
    if (toLayer === 'types' || toLayer === 'assets') continue // 类型与静态资源是全局共享
    if (!ALLOWED[fromLayer].includes(toLayer)) {
      errors.push(`${path.relative(ROOT, file)} 不能 import ${spec}（${fromLayer} → ${toLayer}）`)
      continue
    }
    // 跨层必须走对方的统一出口，不能直接摸到具体文件
    if (rel.length > 2 || (rel.length === 2 && rel[1] !== 'index.ts')) {
      errors.push(`${path.relative(ROOT, file)} 跨层 import 了深层文件 ${spec}，请改走 ../${toLayer}`)
    }
  }
}

if (errors.length) {
  console.error('目录分层检查失败：\n' + errors.map((e) => `- ${e}`).join('\n'))
  process.exit(1)
}
console.log('目录分层检查通过：lib → data → ui → sheets → pages → App')
