"""Assemble self-contained HTML (fonts, logos, QR inlined) and render PNGs with headless Chromium."""
import base64, io, json, os, re, subprocess, sys
from fontTools.ttLib import TTFont
from PIL import Image

S = os.path.dirname(os.path.abspath(__file__))
LANDING = "/Users/georgezakhour/development/docsera-landing"
FONTS = os.path.join(LANDING, "public/fonts")
IMG = os.path.join(LANDING, "public/images")
CHR = os.path.expanduser("~/Library/Caches/ms-playwright/chromium-1134/chrome-mac/Chromium.app/Contents/MacOS/Chromium")
OUT = os.path.join(S, "out")
os.makedirs(OUT, exist_ok=True)

def b64(path):
    return base64.b64encode(open(path, "rb").read()).decode()

def ttf_woff2_b64(path):
    f = TTFont(path); f.flavor = "woff2"; buf = io.BytesIO(); f.save(buf)
    return base64.b64encode(buf.getvalue()).decode()

def face(fam, w, data, fmt="woff2"):
    return f'@font-face{{font-family:"{fam}";font-weight:{w};font-display:block;src:url(data:font/{fmt};base64,{data}) format("{fmt}");}}'

def fonts_css():
    css = []
    for w in (400, 600, 700, 800):
        css.append(face("Cairo", w, b64(f"{FONTS}/Cairo-{w}.woff2")))
    css.append(face("Cairo", 900, ttf_woff2_b64(f"{FONTS}/pro/Cairo-Black.ttf")))
    for w in (500, 600, 700):
        css.append(face("Montserrat", w, b64(f"{FONTS}/Montserrat-{w}.woff2")))
    css.append(face("Montserrat", 900, ttf_woff2_b64(f"{FONTS}/pro/Montserrat-Black.ttf")))
    return "\n".join(css)

def inline_svg(path, cls=""):
    s = open(path, encoding="utf-8").read()
    s = re.sub(r"<\?xml[^>]*\?>", "", s)
    s = re.sub(r"<!DOCTYPE[^>]*>", "", s)
    s = s.strip()
    if "viewBox" not in s:
        m = re.search(r'width="(\d+(?:\.\d+)?)px"\s+height="(\d+(?:\.\d+)?)px"', s)
        if m:
            s = s.replace(m.group(0), f'viewBox="0 0 {m.group(1)} {m.group(2)}"', 1)
    if cls:
        s = s.replace("<svg ", f'<svg class="{cls}" ', 1)
    return s

def qr_svg(fill="#0B2A2E"):
    q = json.load(open(os.path.join(S, "qr.json")))
    n = q["n"]
    return (f'<svg class="qr" viewBox="0 0 {n} {n}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">'
            f'<path fill="{fill}" d="{q["d"]}"/></svg>')

CTX = {
    "FONTS_CSS": fonts_css(),
    "LOGO_WHITE": inline_svg(f"{IMG}/docsera_white.svg", "logo"),
    "LOGO_MAIN": inline_svg(f"{IMG}/docsera_main.svg", "logo"),
    "SHAPE_MAIN": inline_svg(f"{IMG}/DocSera-shape-main.svg", "shape"),
    "SHAPE_WHITE": inline_svg(f"{IMG}/DocSera-shape-white.svg", "shape"),
    "QR_DARK": qr_svg("#0B2A2E"),
    "QR_LIGHT": qr_svg("#FFFFFF"),
    "APP_ICON": "data:image/png;base64," + b64(f"{IMG}/DocSera-app-icon.png"),
}

def assemble(name):
    html = open(os.path.join(S, name), encoding="utf-8").read()
    for k, v in CTX.items():
        html = html.replace("{{" + k + "}}", v)
    out = os.path.join(OUT, name)
    open(out, "w", encoding="utf-8").write(html)
    return out

def render(html_path, png, w, h, query="", trim=False, trim_bg=(255, 255, 255), dsf=1):
    url = "file://" + html_path + (("?" + query) if query else "")
    cmd = [CHR, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--use-mock-keychain",
           "--no-first-run", "--no-default-browser-check", "--disable-extensions",
           f"--window-size={w},{h}", f"--force-device-scale-factor={dsf}",
           "--virtual-time-budget=6000", "--run-all-compositor-stages-before-draw",
           f"--screenshot={png}", url]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if not os.path.exists(png):
        print(r.stderr[-2000:]); raise SystemExit(f"render failed: {png}")
    if trim:
        im = Image.open(png).convert("RGB")
        px = im.load(); W, H = im.size
        bottom = H
        for y in range(H - 1, -1, -1):
            row = [px[x, y] for x in range(0, W, 7)]
            if any(abs(p[0]-trim_bg[0]) + abs(p[1]-trim_bg[1]) + abs(p[2]-trim_bg[2]) > 12 for p in row):
                bottom = y + 1; break
        im.crop((0, 0, min(W, w * dsf), bottom)).save(png)
    im = Image.open(png); print(f"{os.path.basename(png)}  {im.size[0]}x{im.size[1]}")

if __name__ == "__main__":
    jobs = sys.argv[1:] or ["all"]
    DEST = os.path.join(LANDING, "docs/careers"); os.makedirs(DEST, exist_ok=True)
    if "all" in jobs or "posters" in jobs:
        a = assemble("poster_a.html"); render(a, f"{DEST}/poster-A-light-1080x1350.png", 1080, 1350)
        b = assemble("poster_b.html"); render(b, f"{DEST}/poster-B-dark-1080x1350.png", 1080, 1350)
        s = assemble("story_a.html"); render(s, f"{DEST}/story-A-light-1080x1920.png", 1080, 1920)
    if "all" in jobs or "page" in jobs:
        p = assemble("careers_page.html")
        for st in ("1", "3"):
            wrap = os.path.join(OUT, f"phone_wrap_{st}.html")
            open(wrap, "w").write('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}iframe{display:block;border:0;width:390px;height:7000px}</style></head><body><iframe src="careers_page.html?step=' + st + '"></iframe></body></html>')
            render(wrap, f"{DEST}/form-phone-step{st}.png", 390, 7000, trim=True, dsf=2)
        render(p, f"{DEST}/form-desktop-step2.png", 1280, 4200, query="step=2", trim=True)
