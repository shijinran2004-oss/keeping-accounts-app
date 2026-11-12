# 工程结构说明

一句话：**类型只有一份、数据只有一扇门、页面只管展示。**

```
shijinran-money/
├─ src/
│  ├─ types.ts            全项目唯一的类型文件（领域模型 + 数据接口 + 组件契约）
│  ├─ App.tsx             应用外壳：Tab 切换、弹层调度、Android 返回键
│  ├─ main.tsx            入口：样式、状态栏与启动屏
│  ├─ data/               数据层
│  │  ├─ index.ts         对外唯一入口（页面只从这里 import）
│  │  ├─ store.tsx        LedgerProvider / useLedger / 本地持久化 / 导入导出
│  │  └─ categories.ts    内置分类、可选图标与颜色
│  ├─ pages/              页面（一屏一个文件，不含通用逻辑）
│  │  ├─ Home.tsx  Ledger.tsx  Stats.tsx  Me.tsx
│  │  ├─ AddSheet.tsx     记一笔面板：套 MorphSheet，算式键盘 + 分类胶囊条（新增/编辑复用）
│  │  └─ Onboarding.tsx   首次引导
│  ├─ components/         可复用组件
│  │  ├─ index.ts         统一出口
│  │  ├─ Money.tsx        金额渲染（分 → 千分位 + 小数弱化）
│  │  ├─ Charts.tsx       手写 SVG 柱状图 / 环形图
│  │  ├─ SparkSummary.tsx 明细页趋势横条（描边生长 + 面积淡入 + 末点呼吸光斑）
│  │  ├─ MonthCalendar.tsx 明细页月历（金额/圆点、周视图折叠、跨月选中）
│  │  ├─ SuccessReceipt.tsx 记账成功小票（金币落槽 → 出票 → 砸章）
│  │  ├─ MorphSheet.tsx   形变弹层容器（从 + 号按钮长成面板，收起时缩回）
│  │  ├─ Seal.tsx         小狗印章（页头 / 我的 / 引导页 / 小票共用，尺寸三档）
│  │  ├─ Sheet.tsx        常规底部弹层（预算、分类等）
│  │  └─ …                TxRow / TabBar / Toast / Empty / SectionTitle / Icon
│  ├─ utils/             纯函数
│  │  ├─ index.ts         统一出口
│  │  ├─ money.ts         金额格式化与解析（单位：分）
│  │  ├─ date.ts          本地日期运算（周一为周首）
│  │  ├─ stats.ts         区间筛选、分类汇总、资金口径 moneyFlow、连续记账天数 streakDays
│  │  ├─ backup.ts        备份文件的生成 / 写入 / 分享 / 读取（文件名、JSON、字节数）
│  │  ├─ haptics.ts       触感反馈（Capacitor）
│  │  └─ modalStack.ts    弹层栈，供返回键关闭
│  ├─ assets/fonts/       随包分发的中文字体子集（鸿蒙 Sans SC ×3 字重 + Nunito）
│  ├─ assets/mascot.png 印章用的小图（与桌面图标同构图，由 build_brand.py 生成）
│  ├─ vite-env.d.ts       只为 png / woff2 等打包资源提供类型，不放业务类型
│  └─ styles/app.css      单一样式表，文件头有分区目录
├─ android/               Capacitor 生成的 Android 工程（SDK 35 / AGP 8.7.2）
├─ design/build_brand.py  图标 / 启动图 / favicon 生成脚本（抠白底、遮罩、各密度一次铺完）
├─ design/icon-src/       图标源图（手绘贴纸，换图标只换这里）
├─ design/subset_fonts.py 字体子集化脚本（改文案后重跑，把整字库裁成只含 UI 用字）
├─ assets/icon/           生成的 1024px 图标与抠图结果（mascot-cutout.png）
├─ docs/                  架构说明与真机截图
├─ public/                favicon 等静态资源
└─ release/               可直接安装的 APK
```

## 三条硬规矩

1. **类型集中**：新增字段、接口、组件 props 契约，一律先写进 `src/types.ts`，其它文件只用 `import type`。
   页面内部临时状态（比如某个开关）才允许在页面里就地声明。
2. **数据单入口**：页面不允许直接读 `localStorage`，也不允许直接 import `data/store.tsx`；
   统一 `import { useLedger } from '../data'`。以后换 SQLite / 云同步，只改 `data/`。
3. **金额与日期**：金额永远是整数「分」（`cents`），只在展示时格式化；日期永远是本地日期串 `YYYY-MM-DD`，
   不做时区转换。计算都走 `utils/money.ts`、`utils/date.ts`、`utils/stats.ts`，页面里不写业务算式。

## 加东西放哪儿

| 想做的事 | 放这里 |
| --- | --- |
| 加一个页面 | `src/pages/Xxx.tsx`，在 `App.tsx` 的 tab 区挂载 |
| 加一个通用 UI 组件 | `src/components/Xxx.tsx` + 在 `components/index.ts` 导出 |
| 加一个数据类型 / props 契约 | `src/types.ts` |
| 加一个计算口径（如年统计） | `src/utils/stats.ts` |
| 改备份文件名或导出方式 | `src/utils/backup.ts`（页面只调 `exportBackupFile` / `readBackupFile`） |
| 加一个持久化字段 | `src/types.ts` 的 `LedgerState` + `store.tsx` 的 `freshState` / `normalize` |
| 加内置分类 | `src/data/categories.ts` |

## 数据流

```
用户操作 → 页面调用 useLedger().addTx(draft)
        → store 生成 id / createdAt，更新 state
        → useEffect 序列化写入 localStorage('shijinran.money.v1')
        → 订阅了 context 的页面重新渲染
```

读的时候反过来：`useLedger().state` → `utils/stats.ts` 按区间汇总 → 页面渲染。
统计口径集中在 `moneyFlow()`：`可支配 = 工资 + 其他收入 − 固定支出`，`剩余 = 可支配 − 日常支出`。

## 版本与构建

- `versionCode 1` / `versionName 1.0.0`（`android/app/build.gradle`）
- 数据版本 `LedgerState.version = 1`，`normalize()` 会在读取时补全新增的内置分类
- 打包：`npm run build && npx cap copy android`，再 `gradle assembleDebug`
