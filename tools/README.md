# tools

开发期的三个小工具，跟 App 本身没关系，但复现截图和看效果要靠它们。脚本里的路径都可以用环境变量覆盖，默认值就是这台机器的配置。

| 脚本 | 干什么 | 怎么跑 |
| --- | --- | --- |
| `shots-web.cjs` | 用 Chrome 把 13 个页面拍一遍（390×844 @2x），存到 `docs/screenshots/web/` | 先 `npm run dev`，再 `node tools/shots-web.cjs` |
| `shots-android.cjs` | 在真机/模拟器上拍 14 张，存到 `docs/screenshots/android/` | 设备已连 `adb`、APK 已安装，然后 `node tools/shots-android.cjs` |
| `preview.cjs` | 开一个手机尺寸的 Chrome 窗口，灌好演示数据，停在「记一笔」，改代码 HMR 实时反映 | 先 `npm run dev`，再 `node tools/preview.cjs` |

两个截图脚本用同一份种子数据（`lib.cjs` 的 `seedTxs()`：2026 年 11 月，20 笔支出 + 1 笔奖金，月薪 12000 / 固定 3500），所以 Web 版和真机版的数字是一致的。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `SHOTS_URL` / `PREVIEW_URL` | `http://localhost:5173/` | 截图 / 预览打开的地址 |
| `PLAYWRIGHT_DIR` | 自动查找 | 指到含 `playwright` 的 `node_modules`；自动查找顺序是项目依赖 → npx 缓存 |
| `ADB` | `C:/Android/sdk/platform-tools/adb.exe` | adb 路径 |
| `APP_ID` | `com.shijinran.money` | 包名 |
| `CDP_PORT` | `9223` | WebView 远程调试端口，脚本会自己 `adb forward` |

## 真机截图的原理

WebView 开了调试（debug 包默认开），脚本 `adb forward` 把 `webview_devtools_remote_<pid>` 映射到本机端口，然后用原生 WebSocket 说 DevTools 协议：`Runtime.evaluate` 点按钮 / 填数据，再 `adb exec-out screencap -p` 取整屏。

两个坑：

- 原生输入框是 React 受控组件，直接 `el.value = ...` 不生效，灌数据要写 `localStorage` 再 reload；
- Playwright 的 `connectOverCDP` 连 WebView 会报 `Browser context management is not supported`，所以这里不用 Playwright，直接手写 CDP。

## 小票截图的时点

保存后的动效有时序：380ms 开始出票、1150ms 落章、2600ms 收起。「已入账」印章要 1900ms 才拍得清楚，1300ms 拍会是一张还没盖章的票。

## 字体子集

**改文案后一定要重跑** `python design/subset_fonts.py`，否则新出现的汉字会掉回系统字体。脚本会读 `design/fonts-src/` 里的整字库（不进 git，需要时按 `src/assets/fonts/LICENSE.md` 里的地址重新下载），裁好输出到 `src/assets/fonts/`。
