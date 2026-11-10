# 字体与授权

App 内只分发裁过的子集（每个字重约 74 KB），不依赖手机自带字库，因此
在小米、华为、Pixel 上的观感一致。

| 用途 | 字体 | 授权 | 来源 |
| --- | --- | --- | --- |
| 中文标题与正文 | HarmonyOS Sans SC | 华为免费商用（HarmonyOS 开发者文档·字体使用规范） | npm 包 `harmonyos-sans` 内的 `HarmonyOS Sans.zip` |
| 数字与拉丁 | Nunito | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Nunito |

## 为什么选这两个

- 上一版是 Fraunces（高反差复古衬线）+ 思源宋体标题，风格偏“文艺杂志”，
  在 17–47px 的记账界面上显得笨重、老气。
- HarmonyOS Sans 字形开口大、转角微圆、字重层次清楚，10–13px 的小字也耐磨。
- Nunito 端头是圆的，等宽数字（tabular）让列表里的金额竖向对齐；
  和鸿蒙的中文混排比例协调。

## 重新生成子集

见 `design/subset_fonts.py` 顶部说明：把原始字库放进 `design/fonts-src/`
后运行 `python design/subset_fonts.py`。新增文案出现新字时需要重跑。

## 授权正文

HarmonyOS Sans 与 Nunito 的完整授权文本随字库原始发布包提供，
商用与再分发请遵循各自的许可条款；本仓库不再单独复制授权全文。
