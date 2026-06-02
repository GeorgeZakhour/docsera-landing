"""Generate public/og-image.png — a 1200x630 social share banner.

Renders a self-contained HTML banner (real DocSera white logo + brand-shape
watermark + premium teal gradient + app icon filling a rounded container +
light slogan) and rasterizes it with Playwright for crisp, font-accurate output.

Run: python3 scripts/make_og_image.py   (writes /tmp/og_builder.html, then
screenshot it via scripts/shoot_og.mjs — or use the project's Playwright MCP).

This script only ASSEMBLES the self-contained HTML at /tmp/og_builder.html.
The actual screenshot is taken by the caller (Playwright) at 1200x630.
"""
import base64
import io
import os
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "public", "images")
LIGHT_TTF = "/Users/georgezakhour/development/DocSera/assets/fonts/Montserrat-Light.ttf"
OUT_HTML = "/tmp/og_builder.html"


def b64_file(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def ttf_to_woff2_b64(path):
    f = TTFont(path)
    f.flavor = "woff2"
    buf = io.BytesIO()
    f.save(buf)
    return base64.b64encode(buf.getvalue()).decode()


def inline_svg(path):
    s = open(path, encoding="utf-8").read()
    # Drop XML prolog / doctype so it embeds cleanly inside HTML.
    out = []
    for line in s.splitlines():
        t = line.strip()
        if t.startswith("<?xml") or t.startswith("<!DOCTYPE"):
            continue
        out.append(line)
    return "\n".join(out)


logo_svg = inline_svg(os.path.join(IMG, "docsera_white.svg"))
shape_svg = inline_svg(os.path.join(IMG, "DocSera-shape-white.svg"))
icon_b64 = b64_file(os.path.join(IMG, "DocSera-app-icon.png"))
light_b64 = ttf_to_woff2_b64(LIGHT_TTF)

html = f"""<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @font-face {{ font-family:'MontLight'; src:url(data:font/woff2;base64,{light_b64}) format('woff2'); font-weight:300; }}
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  html,body {{ width:1200px; height:630px; }}
  .banner {{
    position:relative; width:1200px; height:630px; overflow:hidden;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    background:
      radial-gradient(ellipse 70% 55% at 50% -5%, rgba(150,255,248,0.22), rgba(150,255,248,0) 60%),
      radial-gradient(ellipse 90% 80% at 50% 120%, rgba(0,40,42,0.55), rgba(0,40,42,0) 55%),
      linear-gradient(145deg, #00a9ab 0%, #008789 40%, #005b5d 75%, #00484a 100%);
  }}
  /* Brand-shape watermark for identity — large, faint, off to one side. */
  .wm {{ position:absolute; opacity:0.05; }}
  .wm svg {{ display:block; }}
  .wm-1 {{ width:760px; right:-200px; bottom:-230px; transform:rotate(-12deg); }}
  .wm-2 {{ width:340px; left:-90px; top:-110px; transform:rotate(8deg); opacity:0.04; }}
  /* Thin top sheen line for a premium edge. */
  .sheen {{ position:absolute; top:0; left:0; right:0; height:2px;
    background:linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent); }}

  .stack {{ position:relative; z-index:2; display:flex; flex-direction:column; align-items:center; }}
  .icon {{
    width:184px; height:184px; border-radius:42px; overflow:hidden;
    box-shadow:0 26px 60px -12px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.10) inset;
    margin-bottom:46px;
  }}
  .icon img {{ width:100%; height:100%; object-fit:cover; display:block; }}
  .logo {{ width:392px; height:auto; margin-bottom:26px; }}
  .logo svg {{ display:block; width:100%; height:auto; }}
  .slogan {{
    font-family:'MontLight', sans-serif; font-weight:300;
    font-size:30px; letter-spacing:3px; color:rgba(231,250,249,0.86);
  }}
</style></head>
<body>
  <div class="banner">
    <div class="wm wm-1">{shape_svg}</div>
    <div class="wm wm-2">{shape_svg}</div>
    <div class="sheen"></div>
    <div class="stack">
      <div class="icon"><img src="data:image/png;base64,{icon_b64}" alt=""></div>
      <div class="logo">{logo_svg}</div>
      <div class="slogan">Your Health, Connected.</div>
    </div>
  </div>
</body></html>
"""

with open(OUT_HTML, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote", OUT_HTML, f"({len(html)//1024} KB self-contained)")
