# 工程结构说明

一句话：**类型只有一份，每层只有一个门，依赖只向下走。**

```
shijinran-money/
├─ src/
│  ├─ types.ts            全项目唯一的类型文件（领域模型 + 数据接口 + 组件契约）
│  ├─ App.tsx             应用外壳：Tab、弹层调度、Android 返回键
│  ├─ main.tsx            入口：样式、启动前恢复主题、状态栏
│  ├─ data/               数据层：账本状态、存储引擎与分类
│  │  ├─ index.ts         对外唯一入口
│  │  ├─ store.tsx        LedgerProvider / useLedger（写入走 repo，不再直写 localStorage）
│  │  ├─ normalize.ts     STORAGE_KEY / freshState / uid / normalize
│  │  ├─ categories.ts    内置分类、图标与颜色
│  │  ├─ db/              IndexedDB 仓库、localStorage 回退与一次性迁移
│  │  │  ├─ idb.ts        连接与事务封装
│  │  │  ├─ repo.ts       IdbRepository（实现 LedgerRepository）
│  │  │  ├─ ls.ts         LsRepository / readLegacyState
│  │  │  └─ migrate.ts    引擎选择、迁移校验、openLedger()
│  │  └─ backup/          v2 备份容器与导入
│  │     ├─ format.ts     format / schema / checksum
│  │     ├─ codec.ts      gzip 编解码
│  │     ├─ parse.ts      解析与校验（含旧版纯 JSON）
│  │     ├─ apply.ts      覆盖 / 合并 / 仅设置
│  │     ├─ preview.ts    导入前对比
│  │     ├─ snapshot.ts   快照与恢复
│  │     └─ export.ts     生成备份文件
│  ├─ lib/                无 UI 的基础能力
│  │  ├─ index.ts         对外唯一入口
│  │  ├─ money.ts         金额格式化与解析（单位：分）
│  │  ├─ date.ts          本地日期、账期、发薪日
│  │  ├─ stats.ts         区间汇总、moneyFlow、连续记账
│  │  ├─ backup.ts        备份文件生成 / 分享 / 读取
│  │  ├─ capture/         分享 / 截屏拿图：原生插件封装
│  │  │  ├─ plugin.ts     Capture 插件、可用性、开关与事件
│  │  │  └─ index.ts      对外唯一入口
│  │  ├─ ocr/             小票识别：原生插件 + 字段抽取
│  │  │  ├─ plugin.ts     Ocr 插件封装、预热、可用性判断
│  │  │  ├─ image.ts      图片压到 1600px 再交给原生
│  │  │  ├─ text.ts       全角转半角、清洗、噪声屏蔽
│  │  │  ├─ amount.ts     金额（实付 > 合计，排找零 / 优惠）
│  │  │  ├─ date.ts       日期（缺年份补全、排除未来）
│  │  │  ├─ merchant.ts   商户名
│  │  │  └─ parse.ts      汇总成 OcrDraft 并猜分类
│  │  ├─ avatar.ts        头像读取与裁剪
│  │  ├─ theme.ts         主题 / 强调色的 data-* 与本地恢复
│  │  ├─ haptics.ts       触感反馈
│  │  └─ modal.ts         弹层栈（返回键关闭最上层）
│  ├─ ui/                 可复用视觉模块，不碰业务写操作
│  │  ├─ index.ts         对外唯一入口
│  │  ├─ Money / TxRow / Empty / SectionTitle
│  │  ├─ Sheet / TabBar / Toast / Icon
│  │  ├─ Charts / MonthCalendar / SparkSummary
│  │  ├─ Doghouse / Seal / LaunchScreen
│  │  └─ …
│  ├─ sheets/             一类弹层一个文件，自己取数、自己保存
│  │  ├─ index.ts         对外唯一入口
│  │  ├─ AddSheet.tsx     记一笔 / 编辑（套 MorphSheet + SuccessReceipt）
│  │  ├─ MorphSheet.tsx   从 + 号原位长成面板的容器（仅 AddSheet 使用）
│  │  ├─ SuccessReceipt.tsx 记账成功小票
│  │  ├─ TxDetailSheet.tsx 流水详情：修改 / 删除
│  │  ├─ NameSheet / BudgetSheet / PaydaySheet
│  │  ├─ CategorySheet    分类管理
│  │  └─ DataSheet        导入 / 导出 / 清空
│  ├─ pages/              页面只做布局与交互编排，不写持久化
│  │  ├─ index.ts         对外唯一入口
│  │  ├─ Home / Ledger / Stats / Me / Onboarding
│  ├─ styles/
│  │  ├─ app.css          结构、组件与基础样式（文件头有分区目录）
│  │  └─ og.css           主题皮肤：深/浅 token、8 个强调色、页面覆盖
│  ├─ assets/             字体、图标、印章、启动海报
│  └─ vite-env.d.ts       只为 png / woff2 提供类型
├─ tools/                 截图、预览、目录分层检查
├─ design/                图标 / 印章 / 字体子集化脚本
├─ docs/                  架构说明与截图
├─ android/               Capacitor 工程
└─ release/               可直接安装的 APK
```

## 依赖方向

```
types
  ↑
 lib
  ↑
data        ui
  ↑         ↑
sheets ─────┘
  ↑
pages
  ↑
App / main
```

- **跨层只能走对方的 `index.ts`**：`import { useLedger } from '../data'`，不允许 `../data/store`。
- **同层文件可以互相 import**：例如 `sheets/AddSheet.tsx` 直接用 `./MorphSheet`。
- `ui` 不导入 `data`：组件只收 props；需要数据的弹层放 `sheets`，页面放 `pages`。
- `lib` 不导入 React 组件；只做纯函数 / 平台能力。
- 运行 `npm run check`：先 `tsc --noEmit`，再跑分层检查，越界导入会直接报错。

## 三条硬规矩

1. **类型集中**：新增字段、接口、组件 props，先写进 `src/types.ts`，其它文件只用 `import type`。
   页面内部临时状态（开关、输入草稿）才允许就地声明。
2. **数据单入口**：页面和弹层不直接读 `localStorage`，也不 import `data/store`；
   统一 `useLedger()`。以后换 SQLite / 云同步，只改 `data/`。
3. **金额与日期**：金额永远是整数「分」，只在展示时格式化；日期是本地日期串 `YYYY-MM-DD`，不做时区转换。
   计算走 `lib/money.ts`、`lib/date.ts`、`lib/stats.ts`，页面里不写业务算式。

## 弹层怎么分工

- **页面**：只保存 `open` 状态，决定打开哪个弹层；不保存弹层内部的表单。
- **弹层**：自己 `useLedger()`、自己校验、自己 `saveSettings` / `addTx`，保存成功后 `onClose()`。
- **容器**：`MorphSheet` 只负责形变动画和关闭方式；`AddSheet` 负责金额、分类、日期与保存。
  `SuccessReceipt` 只负责「记好了」的展示，不碰数据。

这样一层只做一件事，打开一个文件就能看到完整流程，不需要在多层 `props` 之间追状态。

## 注释约定

- 每个导出的组件上方都有一段 `/** … */`，写清「它负责什么、输入是什么、不负责什么」。
- 页面组件说明整体职责；弹层组件说明打开时机、保存行为和关闭方式；纯视觉组件说明数据由谁传入。
- 文件内部的私有小组件（`TabButton`、`Row`、`Shell`）也保留一行职责注释。
- 复杂算法（账期、趋势线几何、形变测量）在函数上方解释边界条件，不在每一行写废话。

## 加东西放哪儿

| 想做的事 | 放这里 |
| --- | --- |
| 加一个页面 | `src/pages/Xxx.tsx`，在 `pages/index.ts` 导出，再到 `App.tsx` 挂载 |
| 加一个通用视觉模块 | `src/ui/Xxx.tsx` + `ui/index.ts` 导出 |
| 加一个弹层 / 表单 | `src/sheets/XxxSheet.tsx` + `sheets/index.ts` 导出 |
| 加一个数据类型 / props 契约 | `src/types.ts` |
| 加一个计算口径 | `src/lib/stats.ts` |
| 改备份文件名或导出方式 | `src/lib/backup.ts` |
| 改头像裁剪 | `src/lib/avatar.ts` 的 `fileToAvatar` |
| 改主题 / 强调色 | `src/lib/theme.ts` 的 `ACCENTS` + `styles/og.css` 顶部 token；明细日历倒计时用 `--accent` 混出四级 |
| 改发薪日 / 工资归属 | `Settings.payday` / `salaryLag` / `paydayOverrides` + `lib/date.ts` 的 `cycleRange` / `effectivePayday` / `nextPayday` |
| 加一个持久化字段 | `types.ts` 的 `LedgerState` + `data/normalize.ts` 的 `freshState` / `normalize` |
| 改存储引擎 / 迁移校验 | `src/data/db/migrate.ts`；临时回退旧存储：`localStorage['shijinran.storage.engine']='ls'` |
| 改备份格式 / 导入规则 | `src/data/backup/`（format / parse / apply / snapshot）；`DataSheet.tsx` 只负责界面 |
| 改小票识别规则 | `src/lib/ocr/`（amount / date / merchant / parse）；原生插件在 `android/app/src/main/java/com/shijinran/money/ocr/OcrPlugin.java` |
| 改分享入口 / 截图监听 | `src/lib/capture/` 与 `android/app/src/main/java/com/shijinran/money/capture/`（`CapturePlugin` 收分享与开关、`ScreenshotWatchService` 监听 MediaStore、`CaptureStore` 记状态） |
| 加内置分类 | `src/data/categories.ts` |
| 改分类图标 | 设置 → 分类管理；`store.tsx` 的 `updateCategoryIcon`，图标库是 `data/categories.ts` 的 `ICON_CHOICES` |

## 数据流

```
用户操作 → 弹层调用 useLedger().addTx(draft)
        → store 生成 id / createdAt，先更新内存 state
        → repo.putTx(tx)：IndexedDB 单条写入；失败时顶部提示，不打断记账
        → 订阅 context 的页面重新渲染

首次启动：openLedger() 打开 IndexedDB → 若库为空且有旧 localStorage 账本，整份迁移并校验条数与抽样 id；
校验失败清空 IDB 并回退旧存储（旧键保持只读，不删）。`localStorage['shijinran.storage.engine']='ls'` 可强制回退。每次写入成功后同步刷新 localStorage 镜像，回退时能读到最新账本。
```

分享 / 截图进来时走另一条入口：原生层把图缩到 1600px 存成 dataUrl（分享读 `ACTION_SEND` 的 `content://`，截图由前台服务监听 MediaStore 新增），前端 `lib/capture` 取出后交给 `AddSheet`，与「拍小票」共用 `recognizeReceipt → parseReceipt → 回填`，仍然由用户点保存才写库。截图监听默认关闭，开关状态存在原生 `SharedPreferences('shijinran.capture')`；服务按 `DATE_ADDED` 时间游标加已处理 ID 去重来找新截图（媒体库的 `_ID` 会被回收重用，不能当游标），只认文件名像截图、时间在开启之后的图片；一次截图常触发多次媒体库回调，会合并成一次扫描；开机或覆盖安装后由 `BootReceiver` 把服务重新拉起。认出金额后发一条高优先级通知：系统会在屏幕顶部弹出一张 QQ 消息式卡片，标题是金额，底部带「确认记录」「取消」两个按钮（取消由 `CaptureCancelReceiver` 自己处理，不依赖服务是否还活着）。

读的时候反过来：`useLedger().state` → `lib/stats.ts` 按区间汇总 → 页面渲染。

统计口径集中在 `moneyFlow()`：`可支配 = 本期工资 + 其他收入 − 固定支出`，`剩余 = 可支配 − 日常支出`。
预算按自然月；`salaryMonth` 是这笔钱归属的月份。发薪日只通过 `effectivePayday()` / `nextPayday()`
影响到账倒计时和「几号到账」文案；`paydayOverrides['YYYY-MM']` 优先于默认 `payday`。

## 视觉层

`main.tsx` 先 import `styles/app.css`，再 import `styles/og.css`。前者是结构层，后者只做两件事：
在 `:root` 覆盖颜色 / 圆角 / 字体 token，以及针对页面补主题规则。同样的选择器，后者后加载生效；
所以换整套配色只改 `og.css` 顶部 token，不要在页面里写死颜色。

主题分三层：

1. `:root` 是深色默认值；`:root[data-theme="light"]` 覆盖同一组语义 token。
2. 8 组 `:root[data-accent="…"]` 覆盖 `--accent` / `--accent-deep` / `--on-accent`；浅色下再叠一层可读的深色版。
3. `lib/theme.ts` 写 `data-theme` / `data-accent`、跟随系统、首屏前恢复；`index.html` 有等价内联脚本防闪。

## 版本与构建

- `versionCode 45` / `versionName 1.4.5`（`android/app/build.gradle`）
- 数据版本 `LedgerState.version = 1`，`normalize()` 读取时补全新增分类与设置
- 存储：IndexedDB（库 `shijinran`，`txs` / `meta` / `snapshots` 三个 store），首次启动从 `localStorage` 一次性迁移；`localStorage['shijinran.storage.engine']='ls'` 可强制回退旧引擎
- 备份：v2 容器带 `schema` / `checksum`，默认 gzip；导入先预览，支持覆盖 / 合并 / 仅设置与分类；导入、清空、恢复前自动快照（保留 5 份）
- 打包：`npm run build && npx cap copy android`，再 `gradle assembleDebug`
- 小票识别：RapidOcrAndroidOnnx 1.3.0（Apache-2.0，PP-OCRv3 det + rec + cls）的 AAR 放在 `android/app/libs/`，39MB 不入库；缺失时 `fetchOcrAar` 任务从 GitHub Release 下载。默认只打 `arm64-v8a,armeabi-v7a`，模拟器用 `-PocrAbi=x86_64`
- 识别流程：`fileToOcrDataUrl()` 压到 1600px → `Ocr.recognize` 在原生线程跑模型、返回行与坐标 → `parseReceipt()` 抽金额 / 日期 / 商户 / 分类 → `AddSheet` 回填，用户确认后才写库
- OCR 引擎：全进程只有一个，由 `android/app/src/main/java/com/shijinran/money/ocr/OcrEngineHolder.java` 提供。RapidOcr 的 native 层不是多实例安全的，截图监听服务和 `Ocr` 插件如果在同一进程各建一个引擎，后来那个实例的识别结果会变成字形相近的乱码；`detect` 也加了锁，两个线程同时调用不会互相踩
- 金额口径（`lib/ocr/amount.ts`）：每个金额只认它左边紧邻的标签（实付 / 实收 / 应付 8，付款 / 支付金额 7，合计 / 总计 / 应收 6，本次消费 5，通用「金额」3，找零 / 优惠 / 折扣 / 原价 / 余额 −9），同行多个金额各算各的；没有小数点且 ≥100 时用商品金额合计反推是「分」还是「元」，都不像就按分记并在 `OcrDraft.warnings` 里提示核对
- 权限：`AndroidManifest.xml` 只申请 `READ_MEDIA_IMAGES`（13+）/ `READ_EXTERNAL_STORAGE`（≤32）、`POST_NOTIFICATIONS`、`FOREGROUND_SERVICE(_SPECIAL_USE)`；不申请 `INTERNET`，安装包无法联网
- 分享 / 截图：`CapturePlugin` 收 `ACTION_SEND`、启停前台服务；`ScreenshotWatchService`（`foregroundServiceType="specialUse"`）用 ContentObserver 监听 MediaStore 新图，只认开启后新增且文件名像截图的，识别到金额后发一条高优先级通知（固定 id，新截图替换旧提醒，标题「识别到 ¥X」，带「确认记录」「取消」两个 action；点确认走 `capture_pending` extra 进 `AddSheet`，点取消由 `CaptureCancelReceiver` 丢掉待确认并收起通知），认不出金额的截图静默丢弃；两条路径都用 `capture_pending` extra 带图进 `AddSheet`，冷启动也生效
- 检查：`npm run check`（tsc + 分层检查）、`npm test`（vitest）
