"""生成「使劲燃的钱」的品牌图：桌面图标、自适应前景、启动图、favicon。

图标用的是 design/icon-src/mascot.png（带白底的手绘贴纸），脚本会先把白底抠掉，
再按 Android 各密度铺出去。改了源图或配色，重跑一次即可：

    python design/build_brand.py

产物写入 android/app/src/main/res/、assets/icon/ 与 public/。
"""

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"
ICON_DIR = ROOT / "assets" / "icon"
PUBLIC = ROOT / "public"
MASCOT_SRC = ROOT / "design" / "icon-src" / "mascot.png"

VERMILION = (194, 86, 59)
CREAM = (255, 249, 240)
PAPER = (245, 241, 232)
INK = (33, 31, 26)
INK_SOFT = (138, 130, 116)

APP_NAME = "使劲燃的钱"
TAGLINE = "每一笔，都算数"

# 启动图里的字跟 App 一致：鸿蒙 Sans（源字体在 design/fonts-src/，不进 git）
FONT_DIR = ROOT / "design" / "fonts-src"
FONT_BOLD = FONT_DIR / "HarmonyOS_Sans_SC_Bold.ttf"
FONT_REGULAR = FONT_DIR / "HarmonyOS_Sans_SC_Regular.ttf"
FONT_FALLBACK = Path("C:/Windows/Fonts/simsun.ttc")
SS = 4  # 超采样倍数

# 自适应图标：圆形遮罩的可见直径是 72/108，图形包围盒的对角线必须小于它才不会被切角
# art 宽高比 ≈ 0.835 → 对角线 = 1.303 × 高；0.51 正好内切，取 0.50 再留一点余量
FG_RATIO = 0.54
# 桌面图标里图形的占比（其余是纸色留白）
ICON_RATIO = 0.74


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold else FONT_REGULAR
    if not path.exists():
        path = FONT_FALLBACK
    return ImageFont.truetype(str(path), size)


def _centered_text(draw: ImageDraw.ImageDraw, width: int, y: float, text: str,
                   f: ImageFont.FreeTypeFont, fill) -> int:
    """按字形包围盒居中并返回下一行的 y（中文基线容易偏，不能直接用 anchor）。"""
    l, t, r, b = draw.textbbox((0, 0), text, font=f)
    draw.text(((width - (r - l)) / 2 - l, y - t), text, font=f, fill=fill)
    return int(y + (b - t))


def cut_out_white(src: Path, tolerance: int = 238) -> Image.Image:
    """把贴纸的白底抠掉：从四边向内洪泛，只吃连通的近白像素，
    所以大熊猫/小狗身上的白色（被黑线围住）不会被误伤。"""
    im = Image.open(src).convert("RGBA")
    arr0 = np.asarray(im)
    rgb = arr0[:, :, :3].astype(np.int16)
    h, w = rgb.shape[:2]

    # 源图最外圈本身可能已经是透明的，所以「透明」和「近白」都算可吃掉的背景；
    # 小狗身上的白被黑线围住，洪泛进不去，不会被误伤。
    near_white = (
        ((rgb[:, :, 0] >= tolerance) & (rgb[:, :, 1] >= tolerance) & (rgb[:, :, 2] >= tolerance))
        | (arr0[:, :, 3] == 0)
    )
    visited = np.zeros((h, w), dtype=bool)
    q = deque()

    for x in range(w):
        for y in (0, h - 1):
            if near_white[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near_white[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))

    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near_white[ny, nx] and not visited[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    arr = arr0.copy()
    arr[visited, 0:4] = 0
    out = Image.fromarray(arr, "RGBA")
    return out.crop(out.getbbox())


def load_mascot() -> Image.Image:
    art = cut_out_white(MASCOT_SRC)
    # 抠图边缘留 1px 毛边，缩到小图标尺寸时看不出来；缓存一份方便别处复用
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    art.save(ICON_DIR / "mascot-cutout.png")
    return art


def seal_sticker(art: Image.Image, size: int = 512) -> Image.Image:
    """App 内的印章小图：与桌面图标同一套构图 —— 方块画布，整张贴纸按 ICON_RATIO 居中。

    不裁头也不切花，缩到 27px 也是个完整的小狗剪影。
    """
    s = size * SS
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    piece = fit(art, int(s * ICON_RATIO))
    canvas.alpha_composite(piece, ((s - piece.width) // 2, (s - piece.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def fit(art: Image.Image, box: int) -> Image.Image:
    """等比缩到 box×box 内并保持透明留白。"""
    w, h = art.size
    scale = box / max(w, h)
    return art.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)


def paper_card(size: int, shape: str = "rounded") -> Image.Image:
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if shape == "circle":
        d.ellipse((0, 0, s - 1, s - 1), fill=PAPER)
    else:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.225), fill=PAPER)
    return img


def paste_art(card: Image.Image, art: Image.Image, ratio: float) -> Image.Image:
    s, _ = card.size
    piece = fit(art, int(s * ratio))
    card.paste(piece, ((s - piece.width) // 2, (s - piece.height) // 2), piece)
    return card


def icon(size: int, art: Image.Image) -> Image.Image:
    card = paper_card(size, "rounded")
    card = paste_art(card, art, ICON_RATIO)
    return card.resize((size, size), Image.LANCZOS)


def round_icon(size: int, art: Image.Image) -> Image.Image:
    card = paper_card(size, "circle")
    card = paste_art(card, art, ICON_RATIO * 0.94)
    return card.resize((size, size), Image.LANCZOS)


def foreground(size: int, art: Image.Image) -> Image.Image:
    """自适应图标前景：透明底，图形收在 108dp 画布的安全区里。"""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    piece = fit(art, int(s * FG_RATIO))
    img.paste(piece, ((s - piece.width) // 2, (s - piece.height) // 2), piece)
    return img.resize((size, size), Image.LANCZOS)


def monochrome(size: int, art: Image.Image) -> Image.Image:
    """Android 13 主题图标用的单色层：只保留轮廓剪影，系统会自己上色。"""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    piece = fit(art, int(s * FG_RATIO))
    mask = piece.getchannel("A").point(lambda a: 255 if a > 40 else 0)
    solid = Image.new("RGBA", piece.size, (255, 255, 255, 255))
    solid.putalpha(mask)
    img.paste(solid, ((s - piece.width) // 2, (s - piece.height) // 2), solid)
    return img.resize((size, size), Image.LANCZOS)


def mask_of(size: int, shape: str) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    if shape == "circle":
        d.ellipse((0, 0, size - 1, size - 1), fill=255)
    elif shape == "squircle":
        d.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.36), fill=255)
    else:
        d.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.225), fill=255)
    return m


def preview_sheet(art: Image.Image) -> Image.Image:
    """给文档用的预览：把图标放进各家的圆圈/方圆遮罩里，模拟桌面上真实长相。"""
    size, gap, pad = 160, 28, 32
    tiles = [
        ("圆角方形", "rounded", False),
        ("圆形", "circle", False),
        ("方圆", "squircle", False),
        ("主题图标", "circle", True),
    ]
    w = pad * 2 + len(tiles) * size + (len(tiles) - 1) * gap
    h = pad * 2 + size + 26
    sheet = Image.new("RGB", (w, h), (28, 27, 25))
    d = ImageDraw.Draw(sheet)
    label_font = font(20)

    for i, (label, shape, mono) in enumerate(tiles):
        x = pad + i * (size + gap)
        y = pad
        if mono:
            # 系统主题图标：底色由壁纸取色，图形走单色层
            layer = Image.new("RGBA", (size, size), (0, 0, 0, 255))
            layer.paste((181, 224, 160, 255), (0, 0, size, size))
            glyph = monochrome(size, art).resize((size, size), Image.LANCZOS)
            glyph = glyph.point(lambda v: v)
            tinted = Image.new("RGBA", (size, size), (58, 74, 52, 255))
            tinted.putalpha(glyph.getchannel("A"))
            layer.alpha_composite(tinted)
            card = layer
        else:
            base = icon(size * 2, art).resize((size, size), Image.LANCZOS)
            card = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            card.paste(base, (0, 0), mask_of(size, shape))
        sheet.paste(card.convert("RGB"), (x, y), mask_of(size, shape))
        l, t, r, b = d.textbbox((0, 0), label, font=label_font)
        d.text((x + (size - (r - l)) / 2 - l, y + size + 8), label, font=label_font, fill=(196, 190, 178))
    return sheet


def paper(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), PAPER)
    d = ImageDraw.Draw(img)
    step = max(14, int(min(w, h) * 0.035))
    for y in range(step // 2, h, step):
        for x in range(step // 2, w, step):
            d.point((x, y), fill=(233, 227, 214))
    return img


def splash(w: int, h: int, art: Image.Image) -> Image.Image:
    # 深色版：纯黑底，白字 + 绿线，和 App 内的 openGym 风格保持一致
    img = Image.new("RGB", (w, h), (0, 0, 0))
    d = ImageDraw.Draw(img)
    unit = min(w, h)

    art_h = int(unit * 0.30)
    piece = fit(art, art_h)
    cx, cy = w // 2, int(h * 0.40)
    img.paste(piece, (cx - piece.width // 2, cy - piece.height // 2), piece)

    name_font = font(int(unit * 0.072), bold=True)
    tag_font = font(int(unit * 0.034))
    text_y = cy + piece.height // 2 + int(unit * 0.06)
    bottom = _centered_text(d, w, text_y, APP_NAME, name_font, (255, 255, 255))

    rule_y = bottom + int(unit * 0.045)
    d.line((cx - unit * 0.05, rule_y, cx + unit * 0.05, rule_y), fill=(48, 209, 88), width=max(1, int(unit * 0.0026)))
    _centered_text(d, w, rule_y + int(unit * 0.035), TAGLINE, tag_font, (150, 150, 155))
    return img


SPLASH_SIZES = {
    "drawable": (480, 320),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
}

MIPMAPS = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
BASE = 48  # mdpi 基准尺寸


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    art = load_mascot()
    print(f"抠图后尺寸 {art.size[0]}×{art.size[1]}")

    master = icon(1024, art)
    master_round = round_icon(1024, art)
    master_fg = foreground(1024, art)
    master_mono = monochrome(1024, art)
    master.save(ICON_DIR / "icon-1024.png")
    master_round.save(ICON_DIR / "icon-round-1024.png")
    master_fg.save(ICON_DIR / "foreground-1024.png")
    master_mono.save(ICON_DIR / "monochrome-1024.png")

    for name, scale in MIPMAPS.items():
        folder = RES / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        big = int(BASE * scale)
        master.resize((big, big), Image.LANCZOS).save(folder / "ic_launcher.png")
        master_round.resize((big, big), Image.LANCZOS).save(folder / "ic_launcher_round.png")
        fg = int(108 * scale)
        master_fg.resize((fg, fg), Image.LANCZOS).save(folder / "ic_launcher_foreground.png")
        master_mono.resize((fg, fg), Image.LANCZOS).save(folder / "ic_launcher_monochrome.png")

    for folder, (w, h) in SPLASH_SIZES.items():
        out = RES / folder
        out.mkdir(parents=True, exist_ok=True)
        splash(w, h, art).save(out / "splash.png")

    # 文档用：桌面遮罩预览
    docs = ROOT / "docs" / "screenshots"
    docs.mkdir(parents=True, exist_ok=True)
    preview_sheet(art).save(docs / "icon-preview.png")

    # App 内的印章：与图标同构图（整张贴纸，不裁切）
    seal_sticker(art).save(ROOT / "src" / "assets" / "mascot.png", optimize=True)

    # 浏览器标签页：同一个图形
    icon(192, art).save(PUBLIC / "favicon-192.png")
    icon(64, art).save(PUBLIC / "favicon.png")

    print("brand assets generated")


if __name__ == "__main__":
    main()
