"""把设计稿 app-icon.png 铺成 Android 各密度的启动图标。

只做图标：不碰启动图、页头小狗印章。
运行：python design/build_icon.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design/icon-src/app-icon.png"
RES = ROOT / "android/app/src/main/res"
ASSETS = ROOT / "assets/icon"
PUBLIC = ROOT / "public"
FONT = ROOT / "design/fonts-src/HarmonyOS_Sans_SC_Bold.ttf"
BG = (11, 21, 19, 255)

MIPMAPS = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUNDS = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
SS = 4


def near_white_mask(im: Image.Image, thresh: int = 238) -> Image.Image:
    w, h = im.size
    rgb = im.convert("RGB")
    mask = Image.new("L", (w, h), 0)
    src, dst = rgb.load(), mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            if r >= thresh and g >= thresh and b >= thresh:
                dst[x, y] = 255
    # 从四个角洪泛，把与画布边缘连通的白色全部标成 128
    for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if mask.getpixel(xy) == 255:
            ImageDraw.floodfill(mask, xy, 128, thresh=0)
    return mask.point(lambda v: 255 if v == 128 else 0)


def cut_white(im: Image.Image) -> Image.Image:
    mask = near_white_mask(im)
    # 外扩 1px，把圆角边缘的抗锯齿白边一起吃掉
    mask = mask.filter(ImageFilter.MaxFilter(3))
    out = im.copy()
    alpha = out.getchannel("A")
    alpha.paste(0, mask=mask)
    out.putalpha(alpha)
    bbox = out.getchannel("A").getbbox()
    return out.crop(bbox) if bbox else out


def fit_square(im: Image.Image, size: int) -> Image.Image:
    s = size * SS
    piece = im.copy()
    scale = min(s / piece.width, s / piece.height)
    piece = piece.resize((max(1, round(piece.width * scale)), max(1, round(piece.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas.alpha_composite(piece, ((s - piece.width) // 2, (s - piece.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def full_bleed(art: Image.Image, size: int) -> Image.Image:
    """透明圆角外面补一层同色模糊底，作为自适应前景，避免圆形遮罩露出白边。"""
    s = size * SS
    bg = art.resize((s, s), Image.LANCZOS).filter(ImageFilter.GaussianBlur(s * 0.035))
    bg.alpha_composite(art.resize((s, s), Image.LANCZOS))
    bg.putalpha(255)
    return bg.resize((size, size), Image.LANCZOS)


def round_icon(full: Image.Image, size: int) -> Image.Image:
    s = size * SS
    canvas = full.resize((s, s), Image.LANCZOS)
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(canvas, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


def monochrome(size: int) -> Image.Image:
    s = size * SS
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    r = int(s * 0.31)
    d.ellipse((s // 2 - r, s // 2 - r, s // 2 + r, s // 2 + r), fill=255)
    font = ImageFont.truetype(str(FONT), int(s * 0.34))
    d.text((s // 2, s // 2 + s * 0.01), "¥", font=font, fill=0, anchor="mm")
    out = Image.new("RGBA", (s, s), (255, 255, 255, 0))
    out.putalpha(mask)
    return out.resize((size, size), Image.LANCZOS)


def main():
    src = Image.open(SRC).convert("RGBA")
    art = cut_white(src)
    full = full_bleed(art, 1024)
    icon = fit_square(art, 1024)
    icon.save(ASSETS / "icon-1024.png")
    round_icon(full, 1024).save(ASSETS / "icon-round-1024.png")
    full.save(ASSETS / "foreground-1024.png")
    monochrome(1024).save(ASSETS / "monochrome-1024.png")

    for density, px in MIPMAPS.items():
        d = RES / f"mipmap-{density}"
        d.mkdir(parents=True, exist_ok=True)
        fit_square(art, px).save(d / "ic_launcher.png")
        round_icon(full, px).save(d / "ic_launcher_round.png")
        full.resize((px, px), Image.LANCZOS).save(d / "ic_launcher_foreground.png")
        monochrome(px).save(d / "ic_launcher_monochrome.png")

    icon.resize((192, 192), Image.LANCZOS).save(PUBLIC / "favicon-192.png")
    icon.resize((64, 64), Image.LANCZOS).save(PUBLIC / "favicon.png")

    # 自适应图标的底：前景铺满，正常情况下看不到，但方形/圆形遮罩的角落会用到
    xml = "\n".join(
        [
            '<?xml version="1.0" encoding="utf-8"?>',
            "<resources>",
            f'    <color name="ic_launcher_background">#{BG[0]:02X}{BG[1]:02X}{BG[2]:02X}</color>',
            "</resources>",
            "",
        ]
    )
    (RES / "values/ic_launcher_background.xml").write_text(xml, encoding="utf-8")
    print("app icon generated", icon.size, "background", BG)


if __name__ == "__main__":
    main()
