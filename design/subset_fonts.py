"""把整字库裁成只含 UI 用字的 woff2，输出到 src/assets/fonts/。

为什么需要子集化：鸿蒙 Sans SC 整字库一个字重 8 MB，三个字重 24 MB；
裁掉没用到的字后每个约 74 KB，整个 App 的字体预算约 260 KB。

用法
----
1. 准备原始字库，放到 design/fonts-src/：
     HarmonyOS_Sans_SC_Regular.ttf
     HarmonyOS_Sans_SC_Medium.ttf
     HarmonyOS_Sans_SC_Bold.ttf
     Nunito.woff2                 # Google Fonts 的 latin 子集即可，无需再裁
   鸿蒙字库来自 npm 包 harmonyos-sans（内含 HarmonyOS Sans.zip），
   Nunito 来自 https://fonts.google.com/specimen/Nunito（下载 woff2）。
   这些原始文件不进仓库（见 .gitignore）。

2. 运行：
     python design/subset_fonts.py

3. 字库新增了字（例如新增页面文案出现新字）时重跑一次即可。
   字符集来自 src 下所有 .tsx/.ts/.html/.css，外加 EXTRA 里的数字与标点。
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_FONTS = os.path.join(ROOT, 'design', 'fonts-src')
OUT = os.path.join(ROOT, 'src', 'assets', 'fonts')
WORK = os.path.join(os.environ.get('TEMP', '/tmp'), 'dsh-font-subset')

# 数字、货币、标点：有些只在运行时拼出来，源码里扫不到，固定保留。
EXTRA = (
    '0123456789'
    '¥$€£+-−—–_=/%‰.,:;!?()[]{}<>«»""\'\'、。,：；！？（）【】《》「」『』…·'
    '×÷±≈≠≤≥°㎡ '
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
)

# 需要裁的中文字库：源文件名 -> 输出文件名 -> 字重说明
JOBS = [
    ('HarmonyOS_Sans_SC_Regular.ttf', 'text-regular.woff2', '400'),
    ('HarmonyOS_Sans_SC_Medium.ttf', 'text-medium.woff2', '500-600'),
    ('HarmonyOS_Sans_SC_Bold.ttf', 'text-bold.woff2', '700-900'),
]
# 已经是 latin 子集、直接拷贝的字体
COPY_JOBS = [('Nunito.woff2', 'Nunito.woff2')]


def collect_chars() -> str:
    chars = set(EXTRA)
    for dirpath, _, files in os.walk(os.path.join(ROOT, 'src')):
        for name in files:
            if name.endswith(('.tsx', '.ts', '.html', '.css')):
                with open(os.path.join(dirpath, name), encoding='utf-8') as fh:
                    chars.update(fh.read())
    with open(os.path.join(ROOT, 'index.html'), encoding='utf-8') as fh:
        chars.update(fh.read())
    return ''.join(sorted(c for c in chars if ord(c) >= 32))


def subset(src: str, dst: str, text_file: str, hint: str) -> None:
    cmd = [
        sys.executable, '-m', 'fontTools.subset', src,
        f'--text-file={text_file}',
        f'--output-file={dst}',
        '--flavor=woff2',
        '--layout-features=kern,liga,tnum,zero',
        '--no-hinting',
        '--desubroutinize',
        '--name-IDs=1,2,3,4,6',
        '--drop-tables+=DSIG',
    ]
    subprocess.run(cmd, check=True)
    print(f'  {os.path.basename(dst):22s} {os.path.getsize(dst) / 1024:6.1f} KB   {hint}')


def main() -> int:
    missing = [name for name, _, _ in JOBS if not os.path.exists(os.path.join(SRC_FONTS, name))]
    missing += [name for name, _ in COPY_JOBS if not os.path.exists(os.path.join(SRC_FONTS, name))]
    if missing:
        print(f'缺少原始字库，放到 {SRC_FONTS} 后再跑：')
        for name in missing:
            print('  -', name)
        return 1

    os.makedirs(WORK, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    text = collect_chars()
    text_file = os.path.join(WORK, 'charset.txt')
    with open(text_file, 'w', encoding='utf-8') as fh:
        fh.write(text)
    print(f'字符集 {len(text)} 个字 -> {text_file}')

    for src_name, out_name, hint in JOBS:
        subset(os.path.join(SRC_FONTS, src_name), os.path.join(OUT, out_name), text_file, f'鸿蒙 Sans SC {hint}')
    for src_name, out_name in COPY_JOBS:
        shutil.copyfile(os.path.join(SRC_FONTS, src_name), os.path.join(OUT, out_name))
        print(f'  {out_name:22s} {os.path.getsize(os.path.join(OUT, out_name)) / 1024:6.1f} KB   直接拷贝')

    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'合计 {total / 1024:.0f} KB')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
