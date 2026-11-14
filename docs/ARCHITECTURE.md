# 工程结构说明

一句话：**类型只有一份、数据只有一扇门、页面只管展示。**

```
shijinran-money/
├─ src/
│  ├─ types.ts            全项目唯一的类型文件（领域模型 + 数据接口 + 组件契约）
│  ├─ App.tsx             应用外壳：Tab 切换、弹层调度、Android 返回键
│  ├─ main.tsx            入口：样式、启动前恢复主题、状态栏与启动屏
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
│  │  ├─ SparkSummary.tsx 明细页趋势横条（裁剪展开 + 面积淡入 + 末点呼吸光斑）
│  │  ├─ MonthCalendar.tsx 明细页月历（金额/圆点、周视图折叠、跨月选中）
│  │  ├─ SuccessReceipt.tsx 记账成功小票（金币落槽 → 出票 → 砸章）
│  │  ├─ LaunchScreen.tsx 冷启动接力（图标 → 海报展开对焦 → 虚化交首页）
│  │  ├─ TxDetailSheet.tsx  点流水后的详情卡，修改时复用记账框
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
│  │  ├─ theme.ts         主题 / 强调色：data-theme / data-accent、系统偏好、本地恢复
│  │  ├─ haptics.ts       触感反馈（Capacitor）
│  │  └─ modalStack.ts    弹层栈，供返回键关闭
│  ├─ assets/fonts/       随包分发的中文字体子集（鸿蒙 Sans SC ×3 字重 + Nunito）
│  ├─ assets/mascot.png 印章用的小图（由 build_brand.py 生成）
│  ├─ vite-env.d.ts       只为 png / woff2 等打包资源提供类型，不放业务类型
│  ├─ styles/app.css      结构、组件与基础样式（文件头有分区目录）
│  └─ styles/og.css       主题皮肤：深/浅两套 token、8 个强调色、首页 / 底栏 / 各页面覆盖
├─ android/               Capacitor 生成的 Android 工程（SDK 35 / AGP 8.7.2）
├─ design/build_icon.py   桌面图标：抠白底、5 密度、圆形 / 自适应 / 单色层、favicon
├─ design/build_brand.py  App 内印章：抠白底、生成 mascot 贴纸
├─ design/icon-src/       源图：app-icon.png 桌面图标，mascot.png 页头小狗印章
├─ design/subset_fonts.py 字体子集化脚本（改文案后重跑，把整字库裁成只含 UI 用字）
├─ assets/icon/           生成的 1024px 图标（桌面图标 + 抠图结果）
├─ docs/                  架构说明与真机截图
├─ public/                favicon 等静态资源
└─ release/               可直接安装的 APK
```

## 视觉层

`main.tsx` 先 import `styles/app.css`，再 import `styles/og.css`。前者是组件与布局的「结构层」，
后者只做两件事：在 `:root` 覆盖颜色 / 圆角 / 字体 token，以及针对具体页面补主题规则。
同样的选择器，后者因为后加载而生效；所以**换整套配色只改 `og.css` 顶部的 token 区**，
不要在页面里写死颜色（`#30d158` 这类值只应出现在 token、强调色预设与 SVG 渐变里）。

主题分三层：

1. `:root` 是深色默认值；`:root[data-theme="light"]` 覆盖同一组语义 token（`--paper` / `--card` / `--ink` / `--line` / `--moss`…）。
2. 8 组 `:root[data-accent="…"]` 覆盖 `--accent` / `--accent-deep` / `--on-accent`；浅色下再叠一层 `[data-theme="light"][data-accent="…"]`，换成白底可读的深色版本。
3. `utils/theme.ts` 负责把用户选择写成 `data-theme` / `data-accent`、跟随 `prefers-color-scheme`、在首屏前从 localStorage 恢复；`index.html` 里还有一段等价的内联脚本，避免 JS 加载前闪一下深色。页面里只存 `settings.theme` / `settings.accent`，不存具体色值。

当前视觉参考 openGym 的移动端版式：纯黑底、`#1c1c1e` 卡片、16px 间距、全宽卡片、底部通栏五项导航。
openGym 是 AGPL-3.0，这里只借鉴版式与间距，没有复制它的代码或素材。

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
| 改头像裁剪尺寸或格式 | `src/utils/avatar.ts` 的 `fileToAvatar` |
| 改主题 / 强调色预设 | `src/utils/theme.ts` 的 `ACCENTS`，配色值在 `styles/og.css` 顶部 |
| 改账本名字 / 问候语 | `Settings.name`（默认值 `DEFAULT_LEDGER_NAME`）+ `Home.tsx` 里的 `greeting(now)` 与 30 秒时钟 |
| 改发薪日 / 工资归属 | `Settings.payday` / `Settings.salaryLag` / `Settings.paydayOverrides` + `utils/date.ts` 的 `cycleRange` / `shiftCycle` / `effectivePayday` / `nextPayday`；预算按自然月，`salaryMonth` 决定工资归属，overrides 只改某个月的到账日 |
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
统计口径集中在 `moneyFlow()`：`可支配 = 本期工资 + 其他收入 − 固定支出`，`剩余 = 可支配 − 日常支出`。预算月由 `cycleRange(date, payday, salaryLag)` 决定（现在就是自然月），`salaryMonth` 是这笔钱归属的月份；`moneyFlow` 的 `daysElapsed` / `daysLeft` 按当月天数计算。发薪日只通过 `effectivePayday()` / `nextPayday()` 影响到账倒计时和「几号到账」文案；`paydayOverrides['YYYY-MM']` 优先于默认 `payday`，保存时若与默认相同则删除该月覆盖。

## 版本与构建

- `versionCode 28` / `versionName 1.1.18`（`android/app/build.gradle`）
- 数据版本 `LedgerState.version = 1`，`normalize()` 会在读取时补全新增的内置分类
- 打包：`npm run build && npx cap copy android`，再 `gradle assembleDebug`
