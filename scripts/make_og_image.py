"""Generate public/og-image.png — a 1200x630 social share banner.

Branded teal gradient + DocSera app icon on a soft plate + Latin wordmark + URL.
Arabic text shaping in PIL is unreliable without a reshaper, so the banner uses
the Latin wordmark; a designed Arabic banner can replace public/og-image.png
later with no code change.

Run once: python3 scripts/make_og_image.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON = os.path.join(ROOT, "public", "images", "DocSera-app-icon.png")
OUT = os.path.join(ROOT, "public", "og-image.png")

W, H = 1200, 630
TEAL = (0, 144, 146)
TEAL_DARK = (0, 77, 77)

# Vertical teal gradient background.
img = Image.new("RGB", (W, H), TEAL)
px = img.load()
for y in range(H):
    t = y / H
    r = int(TEAL[0] + (TEAL_DARK[0] - TEAL[0]) * t)
    g = int(TEAL[1] + (TEAL_DARK[1] - TEAL[1]) * t)
    b = int(TEAL[2] + (TEAL_DARK[2] - TEAL[2]) * t)
    for x in range(W):
        px[x, y] = (r, g, b)

draw = ImageDraw.Draw(img, "RGBA")

# Soft rounded white plate behind the icon.
icon_size = 200
pad = 28
plate = icon_size + pad * 2
plate_x = (W - plate) // 2
plate_y = 96
draw.rounded_rectangle(
    [plate_x, plate_y, plate_x + plate, plate_y + plate],
    radius=44,
    fill=(255, 255, 255, 28),
)

# App icon, centered on the plate.
if os.path.exists(ICON):
    icon = Image.open(ICON).convert("RGBA").resize((icon_size, icon_size))
    img.paste(icon, ((W - icon_size) // 2, plate_y + pad), icon)


def load_font(size, bold=True):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold
        else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                pass
    return ImageFont.load_default()


def centered(y, text, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, y), text, font=font, fill=fill)


centered(396, "DocSera", load_font(92, bold=True), (255, 255, 255))
centered(512, "Your health, simplified.", load_font(36, bold=False), (224, 242, 242))
centered(570, "docsera.app", load_font(30, bold=True), (188, 236, 236))

img.save(OUT, "PNG")
print("wrote", OUT, img.size)
