"""生成「使劲燃的钱」的品牌图：桌面图标、自适应前景、启动图。

用法（在项目根目录）：
    python design/build_brand.py

产物直接写入 android/app/src/main/res/ 与 assets/icon/，源字号、配色集中在本文件顶部。
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"
ICON_DIR = ROOT / "assets" / "icon"

VERMILION = (194, 86, 59)
VERMILION_DEEP = (176, 74, 50)
CREAM = (255, 249, 240)
PAPER = (245, 241, 232)
INK = (33, 31, 26)
INK_SOFT = (138, 130, 116)

SEAL_CHAR = "燃"
APP_NAME = "使劲燃的钱"
TAGLINE = "每一笔，都算数"

FONT = "C:/Windows/Fonts/simsun.ttc"
SS = 4  # 超采样倍数


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def opt_center(draw: ImageDraw.ImageDraw, size: int, text: str, f: ImageFont.FreeTypeFont) -> None:
    """按字形实际包围盒居中，避免字形偏下（中文的常见问题）。"""
    left, top, right, bottom = draw.textbbox((0, 0), text, font=f)
    x = (size - (right - left)) / 2 - left
    y = (size - (bottom - top)) / 2 - top
    # 视觉上略微下压一点点，衬线中文字的重心更稳
    draw.text((x, y + size * 0.006), text, font=f, fill=CREAM)


def rounded_icon(size: int) -> Image.Image:
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(s * 0.225)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=radius, fill=VERMILION)
    inset = int(s * 0.028)
    d.rounded_rectangle(
        (inset, inset, s - 1 - inset, s - 1 - inset),
        radius=int(radius * 0.86),
        outline=VERMILION_DEEP,
        width=max(2, int(s * 0.0035)),
    )
    f = font(int(s * 0.58))
    opt_center(d, s, SEAL_CHAR, f)
    return img.resize((size, size), Image.LANCZOS)


def round_icon(size: int) -> Image.Image:
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((0, 0, s - 1, s - 1), fill=VERMILION)
    inset = int(s * 0.03)
    d.ellipse(
        (inset, inset, s - 1 - inset, s - 1 - inset),
        outline=VERMILION_DEEP,
        width=max(2, int(s * 0.0035)),
    )
    f = font(int(s * 0.54))
    opt_center(d, s, SEAL_CHAR, f)
    return img.resize((size, size), Image.LANCZOS)


def foreground(size: int) -> Image.Image:
    """自适应图标前景：透明底，图形收在 72/108 的安全区内。"""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = font(int(s * 0.5))
    opt_center(d, s, SEAL_CHAR, f)
    return img.resize((size, size), Image.LANCZOS)


def paper(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), PAPER)
    d = ImageDraw.Draw(img)
    step = max(14, int(min(w, h) * 0.035))
    for y in range(step // 2, h, step):
        for x in range(step // 2, w, step):
            d.point((x, y), fill=(233, 227, 214))
    return img


def splash(w: int, h: int) -> Image.Image:
    img = paper(w, h)
    d = ImageDraw.Draw(img)
    unit = min(w, h)

    seal_size = int(unit * 0.26)
    seal = rounded_icon(seal_size)
    cx, cy = w // 2, int(h * 0.42)
    img.paste(seal, (cx - seal_size // 2, cy - seal_size // 2), seal)

    name_font = font(int(unit * 0.072))
    tag_font = font(int(unit * 0.034))
    tw = d.textbbox((0, 0), APP_NAME, font=name_font)
    d.text((cx - (tw[2] - tw[0]) / 2, cy + seal_size * 0.78), APP_NAME, font=name_font, fill=INK)

    rule_y = int(cy + seal_size * 0.78 + (tw[3] - tw[1]) * 1.95)
    d.line((cx - unit * 0.05, rule_y, cx + unit * 0.05, rule_y), fill=VERMILION, width=max(1, int(unit * 0.0026)))

    tg = d.textbbox((0, 0), TAGLINE, font=tag_font)
    d.text((cx - (tg[2] - tg[0]) / 2, rule_y + unit * 0.035), TAGLINE, font=tag_font, fill=INK_SOFT)
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
    master = rounded_icon(1024)
    master_round = round_icon(1024)
    master_fg = foreground(1024)
    master.save(ICON_DIR / "icon-1024.png")
    master_round.save(ICON_DIR / "icon-round-1024.png")
    master_fg.save(ICON_DIR / "foreground-1024.png")

    for name, scale in MIPMAPS.items():
        folder = RES / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        big = int(BASE * scale)
        master.resize((big, big), Image.LANCZOS).save(folder / "ic_launcher.png")
        master_round.resize((big, big), Image.LANCZOS).save(folder / "ic_launcher_round.png")
        fg = int(108 * scale)
        master_fg.resize((fg, fg), Image.LANCZOS).save(folder / "ic_launcher_foreground.png")

    for folder, (w, h) in SPLASH_SIZES.items():
        out = RES / folder
        out.mkdir(parents=True, exist_ok=True)
        splash(w, h).save(out / "splash.png")

    print("brand assets generated")


if __name__ == "__main__":
    main()
