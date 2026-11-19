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

分享 / 截图进来时走另一条入口：原生层把图缩到 1600px 存成 dataUrl（分享读 `ACTION_SEND` 的 `content://`，截图由前台服务监听 MediaStore 新增），前端 `lib/capture` 取出后交给 `AddSheet`，与「拍小票」共用 `recognizeReceipt → parseReceipt → 回填`，仍然由用户点保存才写库。截图监听默认关闭，开关状态存在原生 `SharedPreferences('shijinran.capture')`；服务按 `DATE_ADDED` 时间游标加已处理 ID 去重来找新截图（媒体库的 `_ID` 会被回收重用，不能当游标），只认文件名像截图、时间在开启之后的图片；一次截图常触发多次媒体库回调，会合并成一次扫描；1.4.30 起还有一条可选的「秒弹」快速通道：用户在系统设置里给「所有文件访问」后，服务用 `FileObserver` 直接盯 `DCIM/Screenshots` 与 `Pictures/Screenshots`，MIUI 先写的 `.pending-<序号>-Screenshot_….jpg` 临时文件在写完那一刻就能读（等长度稳定且图头能解开才解码，空壳就隔 200ms 再看、最多 2.4 秒），拿到文件直接用 `decodeFile()` 解码做 OCR，不用等媒体库 3–4 秒的索引延迟；快速通道按 `file:<正式文件名>` 去重，媒体库那条路始终保留作兜底，用户没开权限时行为完全不变；开机或覆盖安装后由 `BootReceiver` 把服务重新拉起。识别一次就把结果留住：服务在后台 OCR 时同时拿到金额和整段文字，连同缓存图存进待确认队列（`CaptureStore` 的 `pendingShots`，最多 4 张），之后点通知打开记一笔直接拿这段文字解析，不再对图片识别第二遍。每张截图各发一条高优先级通知（编号 4301–4499 循环），系统会在屏幕顶部弹出 QQ 消息式卡片，标题是金额，底部带「直接记一笔」「取消」两个按钮：「直接记一笔」由 `CaptureCancelReceiver` 把金额和整段文字存进本地队列，不拉起 Activity，App 在前台时由 `CapturePlugin.pingAutoRecord()` 立刻通知前端冲刷，否则等启动或回前台时用 `drainAutoRecords()` 取走，交给 `data/auto.ts` 的 `autoRecordToTx()` 补商户、分类、日期后写库；「取消」直接丢掉这张待确认的截图并收起通知（两者都由 `CaptureCancelReceiver` 自己处理，不依赖服务是否还活着）。扫描（`scanner` 线程，只查媒体库）与识图（`recognizer` 线程，OCR 串行）分开，扫描重试最多 2 次。`watchStatus()` 同时返回通知总开关、渠道重要性和勿扰状态，前端据此在「我的」里提示横幅为什么没弹，并提供 `openNoticeSettings()` 跳转到系统的渠道设置页；还会返回 `battery`（是否已允许绕过电池优化）和 `lastCheckAt`（上次扫媒体库的时间），没白名单时「我的」多一行「后台限制」，点进去是 `requestIgnoreBattery()`。拿到 `SYSTEM_ALERT_WINDOW` 时，截屏提醒不再等系统弹通知，而是由 `CaptureOverlay` 直接用 `WindowManager`（`TYPE_APPLICATION_OVERLAY`，gravity 顶部）画一张卡片：认出金额才滑下来（认不出的截图完全不出现，不会在屏幕顶上闪一下），直接就是「识别到 ¥X」并带「确认记录」「取消」两个按钮（分别调 `CaptureCancelReceiver.recordShot()` / `cancelShot()`，点卡片本身才打开 App），15 秒自动收起并清掉这条待确认；没有这个权限时退回上面这条高优先级通知，`watchStatus()` 的 `overlay` 字段告诉前端当前能否弹卡片。

后台不被冻住靠两条保险：服务每 30 秒给自己排一个 `AlarmManager`（`ELAPSED_REALTIME`，不要求精确闹钟权限）发给 `CaptureHeartbeatReceiver`，闹钟到点就让服务补扫一次，服务已经没了就重新拉起，拉不起来才发一条「截图记账需要打开一次 App」的通知；这个闹钟只在用户主动关闭开关时取消——服务被系统回收或冻住同样会走 `onDestroy`，那里如果顺手取消闹钟就再没人把服务叫回来了（这是 1.4.11 修掉的问题）。开机、覆盖安装由 `BootReceiver` 重新拉起并先排好闹钟（Android 15 起开机广播里禁止直接启动前台服务，失败就靠闹钟自检）。另外识别前会先判断这张图是不是本 App 自己的界面或通知（`looksLikeOurApp` / `isOwnUi`），是就跳过，避免把自己「识别到 ¥X」的横幅当成金额记一笔假账。没有悬浮窗权限时，截图一进来先用这张截图自己的通知位挂一条「正在认金额…」，识别完在同一个通知位上原地更新成「识别到 ¥X」（先前的写法是另开一条通知再删占位，状态栏会连跳三下），认不出或超时（15 秒）再收起来；有悬浮窗权限时不做这一步，认出金额才让卡片出现。要不要提醒的判定集中在 `ShotRules`：`¥` 后面的数字要同一行或相邻行有「实付 / 合计 / 支付」这类语境，再要求至少一个支付信号（微信支付、支付宝、付款成功、商户、账单日期…），两条都过才算账单，否则静默跳过（2026-11 那次误报治理拆出来的纯函数，带 JVM 单测）；1.4.25 起再加一条兜底：一页里凑够两条强信号（支付成功 / 付款成功 / 交易单号 / 商户全称 / 收单机构 / 账单详情 / 账单服务）时，单独一行只有 `-3.49` 这种裸金额也算数——账单详情页常常既不给 `¥` 也不给「实付」；同一张账单 10 分钟内只提醒一次（`dedupeKey` 取金额加去空白前 200 字的 SHA-256 前 8 字节）。规则表现在只有一份：`src/lib/ocr/capture-rules.json`（全局词表 + 支付宝/微信/银行三个平台模板 + 版面权重），构建时按字节复制到 `android/app/src/main/assets/rules/capture-rules.json`，服务启动时由 `RulesLoader` 读进 `ShotRules.init()`；`capture-rules.test.ts` 校验两份文件完全一致和模板结构，装载失败时 `ShotRules` 一律不弹卡（宁可漏记，不拿半套规则乱弹）。1.4.26 把判定改成三步：先把整页文字归一化（全角数字、千分位逗号、零宽字符、日期时间行），再按平台模板（微信 / 支付宝 / 银行）认「支付金额 / 转账金额」这类锚点标签直接取值，平台认不出才走通用候选打分——每行按「实付 / 合计 / 金额」累加权值、命中「优惠 / 原价 / 券」扣分、余额和可用额度行整行跳过，分数不到门槛或前两名太接近就宁可不弹；最后看方向，命中「退款成功 / 已到账 / 转入 / 收款成功」这类收入词就不弹支出卡；1.4.27 补上微信转账详情页——这种页面没有 `¥` 也没有「实付」，金额是一行带正负号的 `-84.00` / `+100.00`，现在把「转账单号 / 转账说明 / 转账时间 / 收款时间 / 对方已收钱 / 已存入零钱」也算强信号，裸金额允许前导 `+`，并直接用符号判方向：`-` 当支出弹卡、`+` 和「已存入零钱」一律按收入静默跳过。

截图认金额的判定都在 `ShotRules`（纯函数，JVM 单测覆盖），规则全部从 assets 里的 `capture-rules.json` 装载：先 `normalizeText`（全角数字、千分位逗号、零宽字符、日期时间），按行收集候选——平台模板锚点（微信「转账金额」、支付宝「支付金额」、银行「交易金额」）+60、实付类关键词 +50、合计类 +40、`¥` 金额按同行/隔壁行的付款语境 +30/+20/+15，优惠/原价/积分行 −50，余额/额度行整行跳过；1.4.29 起每行还带 OCR 的四角坐标（`OcrEngineHolder.lines()` → `OcrLine`），字号明显大于正文（≥正文中位行高 1.6 倍）、位置靠上（页面上部 45%）、水平居中或靠右的金额再加 +25/+18/+15，页脚（底部 12%）上的大数字 −20，所以「标题下面那个大数字」不用等强信号也能被认出来；最后取最高分候选，最高分不到 15 或和次高分差不到 10 就不提醒。支付宝「账单详情」页没有 `¥` 也没有「实付」，模板命中 detailKeys（收单机构 / 清算机构 / 收款方全称 / 账单分类 / 计入收支 / 支付奖励 / 对方账户）时取第一行独占的金额；「还款成功 / 收益发放 / 退款成功 / 交易关闭」这类页面命中 notExpenseWords，认出金额也只记日志不弹支出卡。行数对不上（例如某些行被当成自己的 UI 过滤掉）时退回纯文本规则，不会拿错位的坐标硬打分。

静默记账（1.4.32）把同一条判定结果直接落库：设置里的「记账方式」存成原生 `SharedPreferences('shijinran.capture')` 的 `captureMode`（`confirm` / `silent`），静默时 `ScreenshotWatchService` 认出金额后不再弹卡，改由 `SilentRecorder.record()` 入队（复用 `autoRecords` 队列和 `auto-<seq>` 这套确定性 id 与 ack 协议），再发一条低优先级通知「已记一笔 ¥X」；HyperOS 的通知栏不给展开动作按钮，所以通知正文直接写「点开 App 可以撤销」，首页「刚自动记的」列出 24 小时内最近 3 条 `auto-*` 流水，点「撤销」走 `deleteTx`。通知上的「撤销」动作在能显示按钮的 ROM 上由 `CaptureCancelReceiver` 处理：它只写撤销记号（`undoneSeqs`，无条件写——App 在前台时记录早已被 JS 取走写进账本，早年「只在队列里找到才写记号」会导致撤销永远删不掉），前端 `drainUndos()` 取走 → 删账本 → `ackUndos()`，中途进程被杀也不会漏删。静默模式下的通知自动记账由 `NotifyWatchService`（`NotificationListenerService`）负责：只在静默模式且用户已授权「通知使用权」时工作，跳过常驻通知和本 App 自己的通知，按 `notification.packages` 白名单只认微信 / 支付宝 / 银行 App；`NotifyRules.parse()` 从 title / text / bigText / subText 里取金额（必须带 `¥` 或「元」）、方向（退款词优先按收入；正文里的「收款成功 / 已到账」算收入，标题里平台名带的「支付」只当支出兜底，避免把收款通知记成支出）、商户（`merchantPatterns`），一屏出现两个不同金额就放弃，同一段文案 10 分钟内只算一次，同金额同方向 90 秒内去重；规则同样来自 `capture-rules.json` 的 `notification` 段，`NotifyRules` 是纯函数、带 JVM 单测，装载失败时一律不记。

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

- `versionCode 73` / `versionName 1.4.33`（`android/app/build.gradle`）
- 数据版本 `LedgerState.version = 1`，`normalize()` 读取时补全新增分类与设置
- 存储：IndexedDB（库 `shijinran`，`txs` / `meta` / `snapshots` 三个 store），首次启动从 `localStorage` 一次性迁移；`localStorage['shijinran.storage.engine']='ls'` 可强制回退旧引擎
- 备份：v2 容器带 `schema` / `checksum`，默认 gzip；导入先预览，支持覆盖 / 合并 / 仅设置与分类；导入、清空、恢复前自动快照（保留 5 份）
- 打包：`npm run build && npx cap copy android`，再 `gradle assembleDebug`；`android/build.gradle` 的 `allprojects.repositories` 里加了 JitPack（`https://jitpack.io`），顶部卡片点确认后的对勾动画用 `com.github.cdflynn:checkview:v1.2`（`cdflynn.android.library.checkview.CheckView`）
- 工具链：Android Gradle 插件 8.13.2 / Gradle 8.14.3 / `kotlin-stdlib` 2.2.20，compileSdk 36、buildTools 36.0.0、targetSdk 35、minSdk 23；AndroidX：activity 1.13.0、appcompat 1.8.0、core 1.18.0、fragment 1.9.1、webkit 1.15.0（1.16 起要求 minSdk 24，所以停在 1.15）、core-splashscreen 1.2.0、coordinatorlayout 1.3.0、junit 1.3.0、espresso 3.7.0。前端依赖：React 18.3.1 / TypeScript 5.9.3 / Vite 5.4.21 / Capacitor 6.2.3（6.x 内已是最新；7、8 是大版本迁移，未动）。
- 小票识别：RapidOcrAndroidOnnx 1.3.0（Apache-2.0，PP-OCRv3 det + rec + cls）的 AAR 放在 `android/app/libs/`，39MB 不入库；缺失时 `fetchOcrAar` 任务从 GitHub Release 下载。默认只打 `arm64-v8a,armeabi-v7a`，模拟器用 `-PocrAbi=x86_64`
- 识别流程：`fileToOcrDataUrl()` 压到 1600px → `Ocr.recognize` 在原生线程跑模型、返回行与坐标 → `parseReceipt()` 抽金额 / 日期 / 商户 / 分类 → `AddSheet` 回填，用户确认后才写库
- OCR 引擎：全进程只有一个，由 `android/app/src/main/java/com/shijinran/money/ocr/OcrEngineHolder.java` 提供。RapidOcr 的 native 层不是多实例安全的，截图监听服务和 `Ocr` 插件如果在同一进程各建一个引擎，后来那个实例的识别结果会变成字形相近的乱码；`detect` 也加了锁，两个线程同时调用不会互相踩；文字的阅读顺序也由这里统一排（`orderedBlocks()` 先按行、行内按 x），截图服务和 `Ocr` 插件共用同一套，避免 RapidOcr 返回顺序不稳定导致前端解析错位；`lines()` 再把每行的四角坐标和识别置信度（`charScores` 均值）一起交给识别规则（`OcrLine`），版面判定用的就是这份坐标
- 金额口径（`lib/ocr/amount.ts`）：每个金额只认它左边紧邻的标签（实付 / 实收 / 应付 8，付款 / 支付金额 7，合计 / 总计 / 应收 6，本次消费 5，通用「金额」3，找零 / 优惠 / 折扣 / 原价 / 余额 −9），同行多个金额各算各的；没有小数点且 ≥100 时用商品金额合计反推是「分」还是「元」，都不像就按分记并在 `OcrDraft.warnings` 里提示核对
- 应用图标 / 启动画面：桌面图标是奶油色圆角卡片（`drawable/ic_launcher_bg.xml` 270° 渐变 #FFFCF4→#FAF0DE）+ 金色 ¥ 硬币和小猪（`mipmap-*/ic_launcher_foreground.png`，抠自 1024 版原图，前景占 58%）。Android 8+ 走 `mipmap-anydpi-v26/ic_launcher.xml` 自适应图标（background 用上面的渐变 drawable、monochrome 是同形状白剪影），旧系统用 `mipmap-*/ic_launcher.png` 预渲染 squircle（圆角半径 22.5%、art 60%、剪影形投影）；`ic_launcher_round.png` 是圆形版。启动主题 `AppTheme.NoActionBarLaunch` 的背景是海报顶边同色 #FCFEF8，`windowSplashScreenAnimatedIcon` 用 1dp 透明的 `splash_blank`（Android 12+ 会把 splash 图标裁进一个方形框，放整张卡片会被切出硬直边，所以系统 splash 只留纯色底）；App 内的冷启动海报 `src/assets/launch-poster.png` 只剩猪和硬币：背景取原卡片的奶油色逐行复制铺满 1416×2532（上 #FCFEF8、下 #E3DBC7 的自然纵向渐变），前景用椭圆羽化遮罩（羽化带宽 30%）把猪、硬币和它们自带的光晕融进奶油底，卡片本身的四角和四条直边都不出现在海报里；`src/styles/og.css` 的 `.launch` 底色同步 #fcfef8，海报从 `blur(10px) scale(1.035)` 渐显到清晰（900ms），和系统 splash 的纯奶油底接上，冷启动只看到一个效果
- 权限：`AndroidManifest.xml` 只申请 `READ_MEDIA_IMAGES`（13+）/ `READ_EXTERNAL_STORAGE`（≤32）、`POST_NOTIFICATIONS`、`FOREGROUND_SERVICE(_SPECIAL_USE)`、`RECEIVE_BOOT_COMPLETED`，以及可选的 `MANAGE_EXTERNAL_STORAGE`（只用于截图「秒弹」快速通道，用户自愿去系统设置开启，不开也能用）和可选的 `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`（只用于跳「不受电池优化限制」设置页，不弹系统对话框）和可选的 `SYSTEM_ALERT_WINDOW`（截屏后自己在屏幕顶部画卡片，用户不允许时退回通知）；不申请 `INTERNET`，安装包无法联网
- 分享 / 截图：`CapturePlugin` 收 `ACTION_SEND`、启停前台服务；`ScreenshotWatchService`（`foregroundServiceType="specialUse"`）用 ContentObserver 监听 MediaStore 新图，只认开启后新增且文件名像截图的，识别到金额后把「金额 + 整段OCR文字 + 缓存图」存进待确认队列并各发一条高优先级通知（编号 4301–4499 循环，标题「识别到 ¥X」，两个按钮直接用 `RemoteViews` 画在通知内容视图里（系统 action 只在展开后才显示，国产 ROM 折叠时看不到），折叠状态也能点；队列最多 4 张，挤掉最旧的会顺手收起它的通知并删缓存；点「直接记一笔」由 `CaptureCancelReceiver` 入队（每条带自增 `seq`，前端用它做确定性 id `auto-<seq>`，重复点/重复取都只会覆盖同一条）、前台即时 ping 或下次回前台由 `autoRecordToTx` 补全后写库；取记录时先写进「在途」存档（`autoRecordsInflight`），前端写库成功调 `ackAutoRecords` 才清掉，写失败或进程被杀下一轮原样再取，不会丢；前端 `applyAutoRecords` 用一条 promise 链串行执行、按最新状态合并、按 id 去重，点取消由同一个接收器丢掉待确认并收起通知），认不出金额的截图静默丢弃；有悬浮窗权限时改由 `CaptureOverlay` 在顶部画卡片（`TYPE_APPLICATION_OVERLAY`，28dp 圆角白卡加投影、48dp 圆角缩略图带淡描边、两个等宽胶囊按钮「确认记录」「取消」、按下有水波纹、弹出回弹缩放，点「确认记录」后两个按钮原地换成绿色对勾 `CheckView`（`check()` 画勾 + 缩放）+「已记一笔」+「¥X 已写进账本，回 App 就能看到」，1.6 秒后自动收起，15 秒无操作也收起并清掉待确认）；权限判断不只看 `Settings.canDrawOverlays()`，还要 `AppOpsManager.checkOpNoThrow(SYSTEM_ALERT_WINDOW)` 放行、且卡片窗口真的挂到屏幕上（`CaptureOverlay.isShowing()`），否则小米 / HyperOS 那种「appops 拒了但 canDrawOverlays 返回 true」的机型会静默失败，画不出来一律退回系统通知；卡片模式下同一时间只留最新一张（来新图清掉上一张没确认的待确认项、它的通知和缓存图），通知只留作通知栏备份、不再弹横幅；服务启动时清掉超过 10 分钟没人确认的遗留项和队列里已无对应记录的通知；分享路径用 `capture_pending` extra 带图进 `AddSheet`，冷启动也生效；「直接记一笔」优先用队列里那一条，队列里已经没有了就退而用通知自带的那份金额文字补记（`CaptureStore` 记最近 40 个已入账的 key，连点两下或重复广播都不会记两笔），连金额都没有时发一条「这张截图没记上」的提示，不再静默丢弃；服务停止时先撤掉延迟任务、提交前确认线程池还活着，补扫任务不会在关闭后崩主线程
- 检查：`npm run check`（tsc + 分层检查）、`npm test`（vitest）
