# 使劲燃的钱

> 每一笔，都算数。

一个可以直接装到 Android 手机上的本地记账 App：随手记一笔支出，按**日 / 周 / 月**看统计，先录月工资和固定支出，再算清每月**可支配的钱**和花掉的比例。

- 纯本地存储，不联网、不上传、无广告、无账号
- 暖纸 / 墨色 / 朱砂配色，衬线数字排版，不套通用 UI 模板
- 安装包：`release/使劲燃的钱-1.0.0.apk`（约 4.2 MB，minSdk 23 / targetSdk 35，arm 全架构）

## 功能

| 模块 | 内容 |
| --- | --- |
| 首页 | 本月可支配金额、已用百分比、剩余、每天还能花多少；常记分类（按使用频率排序）；最近记录 |
| 记一笔 | 自研 4×3 数字键盘、金额分位显示、18 个内置分类（12 支出 / 6 收入）、备注、日期、键盘可盲打 |
| 明细 | 按月切换、全部/支出/收入筛选、按天分组小计、点开可改可删 |
| 统计 | 日 / 周 / 月三档；总支出与环比；每日柱状图；分类环形图与排行；月度预算占用 |
| 我的 | 月工资、固定支出、分类管理、数据导出/导入/清空、重置 |
| 引导 | 首次启动先问「每月到手多少」「每月固定支出」，可跳过，之后在「我的」里补 |

### 计算口径

- **固定支出（房租、房贷、订阅…）只录一次**，作为设置项从工资里预扣，不重复记进每一笔账
- `可支配 = 月工资 + 其他收入 − 固定支出`
- `剩余 = 可支配 − 日常支出`，百分比都以可支配为分母
- 收入分类（奖金/兼职/理财/红包/报销）计入「其他收入」

## 技术选型

React 18 + TypeScript + Vite 5，用 Capacitor 6 打包成原生 Android 壳，数据存 `localStorage`（键名 `shijinran.money.v1`，旧版本数据会自动迁移），图表是手写 SVG，不引入图表库。

```
src/
  types.ts              全部类型与接口（唯一一份）
  data/                 数据层：index.ts 统一出口 → store.tsx / categories.ts
  pages/                Home / Ledger / Stats / Me / AddSheet / Onboarding
  components/           Money、TxRow、Charts、MorphSheet（形变弹层）、Sheet、TabBar、Toast、Icon
  utils/                money、date、stats、haptics、modalStack（index.ts 统一出口）
  styles/app.css        单一样式表，文件头有分区目录
android/                Capacitor 生成的 Android 工程（已配好 SDK 35 / AGP 8.7.2）
design/build_brand.py   图标 / 启动图生成脚本（改配色或名字只改这一处再跑一次）
assets/icon/            1024px 品牌原图
docs/                   架构说明 docs/ARCHITECTURE.md、截图 docs/screenshots/
release/                可直接安装的 APK
```

结构细则见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：类型只写在 `src/types.ts`，页面只从 `../data`、`../components`、`../utils` 三个入口取东西。

## 开发与打包

```bash
npm install          # 依赖（国内可用已写入的 npmmirror 源）
npm run dev          # 浏览器调试
npm run build        # 产出 dist/
npx cap copy android # 同步到原生工程
```

打包 APK（本机已备好 JDK 17 与 Gradle 8.9）：

```bash
cd android
JAVA_HOME='C:\Program Files\Java\jdk-17' /c/Android/gradle-8.9/bin/gradle.bat -p . assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`，`adb install -r` 即可装机。

> 当前为 debug 签名，可直接侧载安装；上架应用商店需要换成自己的 release keystore。

改 App 名字或配色时：改 `design/build_brand.py` 顶部的常量 → `python design/build_brand.py` → 重新 `cap copy` 并打包，图标、各密度启动图会一起更新。

## 截图

| 记一笔 | 记一笔（算式） | 统计 |
| --- | --- | --- |
| ![](docs/screenshots/android/04-add.png) | ![](docs/screenshots/android/05-add-expression.png) | ![](docs/screenshots/android/07-stats-month.png) |

真机全套截图在 `docs/screenshots/android/`（13 张，含形变中间帧），浏览器版在 `docs/screenshots/web/`（12 张）。

## 设计说明

配色：纸 `#F5F1E8`、卡片 `#FFFCF5`、墨 `#211F1A`、朱砂 `#C2563B`、苔绿 `#6E7B5B`。数字用 Fraunces 可变字体，标题用系统衬线，正文用系统无衬线；圆角 18–20px、1px 描边、极浅投影，没有渐变玻璃和霓虹紫。

记一笔是一块「会变形的面板」：点底部中间的加号，那个圆形按钮原地长成整块深色面板（位置、宽高、圆角同一个元素补间，内容延后淡入），收起时再缩回按钮里。面板里是计算器式键盘，`128.5+45` 这样的算式会实时折算出「= ¥173.50」，保存后按钮变成「✓ 已记一笔」再收起。整块面板的配色是纸面上的深色对比面：炭黑 `#15181A` + 薄荷绿 `#2FBF87`，与正文的朱砂不冲突。


## 参考的开源项目

调研后没有直接套壳，而是取了各家信息架构和交互里最成熟的部分，重写成一套自己的视觉：

- [glink25/Cent](https://github.com/glink25/Cent)：账本 / 分类 / 交易 / 统计四段式信息架构
- [mayswind/ezbookkeeping](https://github.com/mayswind/ezbookkeeping)：多币种与统计口径的参考
- [LouBii/OneAccount](https://github.com/LouBii/OneAccount)：极简记账的数据结构
- [378056350/react-native-bookkeeping](https://github.com/378056350/react-native-bookkeeping)：鲨鱼记账式数字键盘与九宫格分类
- [forkdog/Bookkeeping](https://github.com/forkdog/Bookkeeping)：移动端记账的页面流

交互细节同时参考了 B 站记账类测评里被反复提到的点：一页账、卡片式、少层级、无广告、数字优先。
