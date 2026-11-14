"""把小史努比重绘成矢量，渲染成 design/icon-src/mascot.png。

改 design/mascot.svg 后重跑：

    python design/build_mascot.py

再跑 python design/build_brand.py 把新图铺到 App 与 Android 资源。
"""
from pathlib import Path
import subprocess
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "design" / "mascot.svg"
OUT = ROOT / "design" / "icon-src" / "mascot.png"
PREVIEW = ROOT / "design" / "mascot-preview.png"
CHROME = Path(r"C:/Program Files/Google/Chrome/Application/chrome.exe")
EDGE = Path(r"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")
SIZE = 512


def browser() -> Path:
    for p in (CHROME, EDGE):
        if p.exists():
            return p
    sys.exit("没找到 Chrome/Edge，无法渲染 SVG")


def main() -> None:
    raw = ROOT / "design" / "_mascot_raw.png"
    subprocess.run([
        str(browser()), "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--default-background-color=00000000", "--force-device-scale-factor=2",
        f"--window-size={SIZE},{SIZE}", f"--screenshot={raw}", SVG.as_uri(),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    im = Image.open(raw).convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)
    im.save(OUT)
    bg = Image.new("RGBA", (SIZE, SIZE), (245, 241, 232, 255))
    bg.alpha_composite(im)
    bg.save(PREVIEW)
    raw.unlink(missing_ok=True)
    print(f"mascot.png {OUT.stat().st_size} B, preview {PREVIEW.name}")


if __name__ == "__main__":
    main()
