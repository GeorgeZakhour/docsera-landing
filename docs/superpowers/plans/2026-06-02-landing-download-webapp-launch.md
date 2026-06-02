# Landing Page — Download Hub, Web-App Entry & Launch Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give docsera.app visitors a clear path to the web app (`my.docsera.app`) and the Android APK, honestly mark the stores as "قريباً", fix dead links, and make shared links render clean preview cards.

**Architecture:** Astro static site. Two universal actions (web-app-first + download) applied to the navbar, Hero, homepage bottom CTA, and a new shareable `/download` page. APK served by nginx from `/downloads/`; the file is dropped in before go-live. SEO/social via Open Graph meta in the shared `Layout`, plus `robots.txt`, `sitemap.xml`, and a generated `og-image.png`.

**Tech Stack:** Astro 5, scoped component CSS, nginx (Docker), Python+PIL (one-off OG image), no JS framework.

**Testing note:** This repo has **no unit-test framework** (it's a static marketing site). "Verification" for each task = `npm run build` succeeds (catches Astro/syntax errors) + targeted `grep` assertions, and a final visual pass with the dev server. Do not invent a test framework.

**Design tokens (match these exactly):** `--c-main: #009092`, `--c-main-dark: #007474`, `--c-main-light: #E0F2F2`, fonts `--font-ar: 'Cairo'` / `--font-en: 'Montserrat'`. Glassmorphism, rounded cards, soft shadows. RTL (`dir="rtl"`).

**Commit per task. Do NOT push** (the user pushes / triggers deploy themselves).

---

### Task 1: SEO foundation — `site` config + Layout meta + viewport fix

**Files:**
- Modify: `astro.config.mjs`
- Modify: `src/layouts/Layout.astro` (frontmatter + `<head>`; leave the `<style is:global>` block untouched)

- [ ] **Step 1: Add the canonical site URL to Astro config**

Replace the entire contents of `astro.config.mjs` with:

```js
// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://docsera.app',
});
```

- [ ] **Step 2: Extend Layout props and emit SEO/social meta**

Replace the frontmatter (lines 1–7, the first `---` fenced block) of `src/layouts/Layout.astro` with:

```astro
---
interface Props {
	title: string;
	description?: string;
	image?: string;
	path?: string;
}

const {
	title,
	description = 'دوكسيرا — منصة الرعاية الصحية الرقمية في سوريا. احجز مواعيدك، تواصل مع طبيبك، واحفظ ملفك الطبي في مكان واحد.',
	image = '/og-image.png',
	path = '',
} = Astro.props;

const SITE = 'https://docsera.app';
const canonical = SITE + path;
const ogImage = image.startsWith('http') ? image : SITE + image;
---
```

Then replace the `<head>` block (currently lines ~11–21) with:

```astro
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="description" content={description} />
		<link rel="canonical" href={canonical} />
		<link rel="icon" type="image/png" href="/images/DocSera-app-icon.png" />

		<!-- Open Graph -->
		<meta property="og:type" content="website" />
		<meta property="og:site_name" content="DocSera" />
		<meta property="og:locale" content="ar_AR" />
		<meta property="og:title" content={title} />
		<meta property="og:description" content={description} />
		<meta property="og:url" content={canonical} />
		<meta property="og:image" content={ogImage} />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />

		<!-- Twitter -->
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={title} />
		<meta name="twitter:description" content={description} />
		<meta name="twitter:image" content={ogImage} />

		<link rel="preconnect" href="https://fonts.googleapis.com">
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
		<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
		<meta name="generator" content={Astro.generator} />
		<title>{title}</title>
	</head>
```

Leave the `<body>` and the entire `<style is:global>` block exactly as they are.

- [ ] **Step 3: Build to verify no syntax errors**

Run: `npm run build`
Expected: build completes, "Complete!" / pages built, exit 0.

- [ ] **Step 4: Verify meta is emitted**

Run: `grep -c 'og:image' dist/index.html`
Expected: `1` (or higher).

- [ ] **Step 5: Commit**

```bash
git add astro.config.mjs src/layouts/Layout.astro
git commit -m "feat(seo): Open Graph/Twitter meta + canonical + viewport fix"
```

---

### Task 2: `robots.txt` + `sitemap.xml`

**Files:**
- Create: `public/robots.txt`
- Create: `public/sitemap.xml`

- [ ] **Step 1: Create robots.txt**

Create `public/robots.txt` with:

```
User-agent: *
Allow: /

Sitemap: https://docsera.app/sitemap.xml
```

- [ ] **Step 2: Create sitemap.xml**

Create `public/sitemap.xml` with:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://docsera.app/</loc><priority>1.0</priority></url>
  <url><loc>https://docsera.app/download</loc><priority>0.9</priority></url>
  <url><loc>https://docsera.app/features</loc><priority>0.8</priority></url>
  <url><loc>https://docsera.app/about</loc><priority>0.6</priority></url>
  <url><loc>https://docsera.app/help</loc><priority>0.6</priority></url>
  <url><loc>https://docsera.app/privacy-policy/</loc><priority>0.4</priority></url>
  <url><loc>https://docsera.app/terms-of-service/</loc><priority>0.4</priority></url>
  <url><loc>https://docsera.app/medical-disclaimer/</loc><priority>0.4</priority></url>
  <url><loc>https://docsera.app/report-illicit-content/</loc><priority>0.4</priority></url>
</urlset>
```

- [ ] **Step 3: Build and verify they ship**

Run: `npm run build && ls dist/robots.txt dist/sitemap.xml`
Expected: both paths listed, exit 0.

- [ ] **Step 4: Commit**

```bash
git add public/robots.txt public/sitemap.xml
git commit -m "feat(seo): robots.txt + static sitemap.xml"
```

---

### Task 3: Generate the social share image `og-image.png` (1200×630)

**Files:**
- Create: `scripts/make_og_image.py`
- Create (generated): `public/og-image.png`

**Note:** Arabic text shaping in PIL is unreliable without a bundled reshaper, so the banner uses the existing brand app-icon + the Latin "DocSera" wordmark + URL on a branded teal background. This is a clean, reliable launch banner; a designed Arabic banner can replace `public/og-image.png` later with no code change.

- [ ] **Step 1: Write the generator script**

Create `scripts/make_og_image.py` with:

```python
"""Generate public/og-image.png — a 1200x630 social share banner.

Branded teal background + DocSera app icon + Latin wordmark + URL.
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
top, bot = TEAL, TEAL_DARK
for y in range(H):
    t = y / H
    r = int(top[0] + (bot[0] - top[0]) * t)
    g = int(top[1] + (bot[1] - top[1]) * t)
    b = int(top[2] + (bot[2] - top[2]) * t)
    ImageDraw.Draw(img).line([(0, y), (W, y)], fill=(r, g, b))

draw = ImageDraw.Draw(img)

# App icon, centered upper area, with a soft rounded white plate behind it.
icon_size = 200
plate_pad = 28
plate_size = icon_size + plate_pad * 2
plate_x = (W - plate_size) // 2
plate_y = 110
plate = Image.new("RGBA", (plate_size, plate_size), (255, 255, 255, 30))
img.paste(Image.new("RGB", (plate_size, plate_size), (255, 255, 255)).convert("RGB"),
          (plate_x, plate_y),
          Image.new("L", (plate_size, plate_size), 26))
if os.path.exists(ICON):
    icon = Image.open(ICON).convert("RGBA").resize((icon_size, icon_size))
    img.paste(icon, ((W - icon_size) // 2, plate_y + plate_pad), icon)

def load_font(size, bold=True):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
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

def centered_text(y, text, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, y), text, font=font, fill=fill)

centered_text(400, "DocSera", load_font(92, bold=True), (255, 255, 255))
centered_text(515, "Your health, simplified.", load_font(36, bold=False), (224, 242, 242))
centered_text(572, "docsera.app", load_font(30, bold=True), (188, 236, 236))

img.save(OUT, "PNG")
print("wrote", OUT, img.size)
```

- [ ] **Step 2: Run it**

Run: `python3 scripts/make_og_image.py`
Expected: `wrote .../public/og-image.png (1200, 630)`

- [ ] **Step 3: Verify the file**

Run: `python3 -c "from PIL import Image; print(Image.open('public/og-image.png').size)"`
Expected: `(1200, 630)`

- [ ] **Step 4: Commit**

```bash
git add scripts/make_og_image.py public/og-image.png
git commit -m "feat(seo): generate 1200x630 social share image"
```

---

### Task 4: Homepage bottom CTA — action buttons, glass "soon" badges, `id="download"`, fix `/faq`

**Files:**
- Modify: `src/pages/index.astro` (the `.final-cta` section markup ~lines 313–343; the `/faq` link at line 303; CSS in the `<style>` block; the page `<Layout>` tag at line 9)

- [ ] **Step 1: Give the homepage a real title + description**

Replace line 9 `<Layout title="DocSera - دوكسيرا">` with:

```astro
<Layout
	title="DocSera — دوكسيرا | صحتك بكل بساطة"
	description="دوكسيرا منصة الرعاية الصحية الرقمية في سوريا. احجز مواعيدك، تواصل مع طبيبك عبر الشات، واحفظ ملفك الطبي وملفات عائلتك في مكان واحد."
	path="/"
>
```

- [ ] **Step 2: Fix the dead `/faq` link**

At `src/pages/index.astro:303`, change:

```astro
<a href="/faq" class="btn-help">
```
to:
```astro
<a href="/help" class="btn-help">
```

- [ ] **Step 3: Rebuild the `.final-cta` section markup**

Replace the whole `<section class="final-cta"> … </section>` block (currently ~lines 313–343) with:

```astro
        <!-- CTA Wave + Download Hub -->
        <section class="final-cta" id="download">
            <div class="wave-top">
                <svg viewBox="0 0 1440 180" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#ffffff" fill-opacity="1" d="M0,0 L1440,0 L1440,180 Q720,60 0,180 Z"></path>
                </svg>
            </div>

            <div class="container cta-content">
                <h2 class="text-huge" style="color:white">ابدأ رحلتك الصحية اليوم</h2>
                <p>مستقبل الطب الرقمي، يبدأ في سوريا</p>

                <div class="cta-actions">
                    <a href="https://my.docsera.app" class="cta-btn primary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>
                        افتح تطبيق الويب
                    </a>
                    <a href="/downloads/docsera.apk" class="cta-btn secondary" download>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        تحميل تطبيق أندرويد
                    </a>
                </div>

                <p class="soon-label">متوفر قريباً على المتاجر الرسمية</p>
                <div class="store-buttons">
                    <!-- Pre-launch: non-clickable, glass قريباً badge. Swap each
                         <div class="official-badge is-soon"> to <a href="STORE_URL">
                         and remove the .is-soon class + .soon-badge span when live. -->
                    <div class="official-badge is-soon" aria-disabled="true" aria-label="App Store (قريباً)">
                        <span class="soon-badge">قريباً</span>
                        <svg class="os-icon" viewBox="0 0 384 512" fill="white"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 52.3-11.4 69.5-34.3z"/></svg>
                        <div class="badge-text">
                            <span class="small-txt">Download on the</span>
                            <span class="big-txt">App Store</span>
                        </div>
                    </div>

                    <div class="official-badge is-soon" aria-disabled="true" aria-label="Google Play (قريباً)">
                        <span class="soon-badge">قريباً</span>
                        <svg class="os-icon" viewBox="0 0 512 512" fill="white"><path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/></svg>
                        <div class="badge-text">
                            <span class="small-txt">GET IT ON</span>
                            <span class="big-txt">Google Play</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
```

- [ ] **Step 4: Add the CTA button + glass-badge CSS**

In the `<style>` block of `src/pages/index.astro`, find the existing `/* Official Store Badges */` rules (the `.store-buttons` / `.official-badge` group, ~lines 626–645) and replace that group with this expanded version (keeps the originals, adds actions + soon styling):

```css
    /* Download Hub actions */
    .cta-actions {
        display: flex;
        gap: 16px;
        justify-content: center;
        flex-wrap: wrap;
        margin-bottom: 32px;
    }
    .cta-btn {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 16px 32px;
        border-radius: 14px;
        font-weight: 700;
        font-size: 1.05rem;
        text-decoration: none;
        transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    }
    .cta-btn svg { width: 20px; height: 20px; flex-shrink: 0; }
    .cta-btn.primary {
        background: white;
        color: var(--c-main);
        box-shadow: 0 10px 30px rgba(0,0,0,0.15);
    }
    .cta-btn.primary:hover { transform: translateY(-3px); box-shadow: 0 14px 36px rgba(0,0,0,0.22); }
    .cta-btn.secondary {
        background: rgba(255,255,255,0.10);
        color: white;
        border: 1.5px solid rgba(255,255,255,0.6);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
    }
    .cta-btn.secondary:hover { background: rgba(255,255,255,0.20); transform: translateY(-3px); }

    .soon-label {
        color: rgba(255,255,255,0.85) !important;
        font-size: 0.95rem !important;
        margin: 4px 0 16px !important;
    }

    /* Official Store Badges */
    .store-buttons { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
    .official-badge {
        position: relative;
        display: inline-flex;
        align-items: center;
        background: black;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 8px;
        padding: 8px 16px;
        color: white;
        text-decoration: none;
        direction: ltr;
        transition: transform 0.2s, background 0.2s;
        min-width: 160px;
    }
    .official-badge:not(.is-soon):hover { transform: translateY(-3px); background: #222; }
    .official-badge.is-soon { cursor: default; }
    .os-icon { width: 28px; height: 28px; margin-right: 10px; flex-shrink: 0; }
    .badge-text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.1; }
    .small-txt { font-size: 0.65rem; text-transform: uppercase; opacity: 0.8; }
    .big-txt { font-size: 1.1rem; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }

    /* Glass "soon" badge overlay */
    .soon-badge {
        position: absolute;
        top: -10px;
        right: -10px;
        background: rgba(255,255,255,0.18);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.45);
        color: #fff;
        font-family: var(--font-ar);
        font-size: 0.7rem;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: 20px;
        line-height: 1.4;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: exit 0.

Run: `grep -c 'id="download"' dist/index.html && grep -c 'href="/faq"' dist/index.html`
Expected: first `1`, second `0` (no `/faq` left).

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat(landing): download hub CTA + glass soon badges + fix /faq link"
```

---

### Task 5: Navbar — two buttons (web app + download)

**Files:**
- Modify: `src/components/Navbar.astro` (desktop actions ~line 19–21, mobile drawer ~line 37, CSS for `.btn-download`)

- [ ] **Step 1: Replace the desktop action button**

Replace (lines ~19–21):

```astro
        <div class="actions desktop-only">
            <a href="#download" class="btn-download">حمل التطبيق</a>
        </div>
```
with:
```astro
        <div class="actions desktop-only">
            <a href="https://my.docsera.app" class="btn-webapp">افتح تطبيق الويب</a>
            <a href="/download" class="btn-dl">تحميل</a>
        </div>
```

- [ ] **Step 2: Replace the mobile-drawer button**

Replace (line ~37):

```astro
        <a href="#download" class="m-btn">حمل التطبيق</a>
```
with:
```astro
        <a href="https://my.docsera.app" class="m-btn">افتح تطبيق الويب</a>
        <a href="/download" class="m-btn outline">تحميل التطبيق</a>
```

- [ ] **Step 3: Replace the `.btn-download` CSS with two-button styles**

In the `<style>` block, replace the `.btn-download { … }` rule (~lines 139–147) with:

```css
    .actions { display: flex; align-items: center; gap: 12px; }

    .btn-webapp {
        background: var(--c-main);
        color: white;
        text-decoration: none;
        padding: 8px 20px;
        border-radius: 100px;
        font-weight: 700;
        font-size: 0.9rem;
        white-space: nowrap;
        transition: background 0.2s;
    }
    .btn-webapp:hover { background: var(--c-main-dark); }

    .btn-dl {
        color: var(--c-main);
        text-decoration: none;
        padding: 8px 18px;
        border-radius: 100px;
        font-weight: 700;
        font-size: 0.9rem;
        border: 1.5px solid var(--c-main);
        white-space: nowrap;
        transition: background 0.2s;
    }
    .btn-dl:hover { background: rgba(0,144,146,0.08); }
```

- [ ] **Step 4: Add the mobile outline-button style**

In the same `<style>` block, directly after the existing `.m-btn { … }` rule (~lines 203–211), add:

```css
    .m-btn.outline {
        background: transparent;
        color: var(--c-main);
        border: 1.5px solid var(--c-main);
    }
```

- [ ] **Step 5: Build and verify**

Run: `npm run build && grep -c 'افتح تطبيق الويب' dist/index.html`
Expected: exit 0; count ≥ `1`.

- [ ] **Step 6: Commit**

```bash
git add src/components/Navbar.astro
git commit -m "feat(landing): navbar web-app + download buttons"
```

---

### Task 6: Hero — primary button → web app

**Files:**
- Modify: `src/components/Hero.astro` (button at lines ~26–29)

- [ ] **Step 1: Repoint and relabel the Hero primary button**

Replace (lines ~26–29):

```astro
                <a href="#download" class="btn-primary">
                    <span class="btn-icon">❄</span>
                    حمل التطبيق
                </a>
```
with:
```astro
                <a href="https://my.docsera.app" class="btn-primary">
                    <span class="btn-icon">▶</span>
                    افتح تطبيق الويب
                </a>
```

(The secondary "استكشف التطبيق" → `/features` button stays unchanged.)

- [ ] **Step 2: Build and verify the dead anchor is gone**

Run: `npm run build && grep -rc 'href="#download"' dist/index.html`
Expected: `0` (Hero no longer emits it; the section `id="download"` from Task 4 remains as a defensive target).

- [ ] **Step 3: Commit**

```bash
git add src/components/Hero.astro
git commit -m "feat(landing): hero primary CTA opens web app"
```

---

### Task 7: New `/download` page

**Files:**
- Create: `src/pages/download.astro`

- [ ] **Step 1: Create the page**

Create `src/pages/download.astro` with the full contents:

```astro
---
import Layout from '../layouts/Layout.astro';
import Navbar from '../components/Navbar.astro';
import Footer from '../components/Footer.astro';

const WEB_APP_URL = 'https://my.docsera.app';
const APK_URL = '/downloads/docsera.apk';
---

<Layout
	title="حمّل دوكسيرا — DocSera"
	description="استخدم دوكسيرا الآن من المتصفح بدون تثبيت، أو حمّل تطبيق أندرويد على هاتفك. مواعيد، مراسلات، وملف طبي في مكان واحد."
	path="/download"
>
	<Navbar />
	<main class="dl-page">
		<section class="dl-hero">
			<div class="container">
				<div class="dl-head">
					<div class="dl-pill">ابدأ خلال ثوانٍ</div>
					<h1 class="dl-title">حمّل دوكسيرا<br />وابدأ رحلتك الصحية</h1>
					<p class="dl-sub">استخدمه فوراً من المتصفح دون تثبيت، أو حمّل تطبيق أندرويد على هاتفك.</p>
				</div>

				<div class="dl-actions">
					<a href={WEB_APP_URL} class="dl-card primary">
						<div class="dl-card-icon">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>
						</div>
						<div class="dl-card-text">
							<strong>افتح تطبيق الويب</strong>
							<span>يعمل على كل الأجهزة — بدون تثبيت</span>
						</div>
					</a>
					<a href={APK_URL} class="dl-card secondary" download>
						<div class="dl-card-icon">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
						</div>
						<div class="dl-card-text">
							<strong>تحميل تطبيق أندرويد</strong>
							<span>ملف APK مباشر لهاتف أندرويد</span>
						</div>
					</a>
				</div>
			</div>
		</section>

		<section class="dl-install">
			<div class="container">
				<h2 class="dl-h2">كيفية تثبيت تطبيق أندرويد</h2>
				<div class="dl-steps">
					<div class="dl-step"><span class="dl-num">1</span><p>اضغط على «تحميل تطبيق أندرويد» لتنزيل الملف.</p></div>
					<div class="dl-step"><span class="dl-num">2</span><p>افتح الملف من شريط الإشعارات أو مجلد التنزيلات.</p></div>
					<div class="dl-step"><span class="dl-num">3</span><p>إذا طُلب منك، فعّل «السماح بالتثبيت من هذا المصدر».</p></div>
					<div class="dl-step"><span class="dl-num">4</span><p>اضغط «تثبيت»، ثم افتح دوكسيرا وابدأ.</p></div>
				</div>
				<p class="dl-ios-note">مستخدمو آيفون (iOS): النسخة قادمة قريباً — استخدم تطبيق الويب الآن.</p>
			</div>
		</section>

		<section class="dl-stores">
			<div class="container">
				<p class="dl-soon-label">متوفر قريباً على المتاجر الرسمية</p>
				<div class="store-buttons">
					<div class="official-badge is-soon" aria-disabled="true" aria-label="App Store (قريباً)">
						<span class="soon-badge">قريباً</span>
						<svg class="os-icon" viewBox="0 0 384 512" fill="white"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 52.3-11.4 69.5-34.3z"/></svg>
						<div class="badge-text">
							<span class="small-txt">Download on the</span>
							<span class="big-txt">App Store</span>
						</div>
					</div>
					<div class="official-badge is-soon" aria-disabled="true" aria-label="Google Play (قريباً)">
						<span class="soon-badge">قريباً</span>
						<svg class="os-icon" viewBox="0 0 512 512" fill="white"><path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/></svg>
						<div class="badge-text">
							<span class="small-txt">GET IT ON</span>
							<span class="big-txt">Google Play</span>
						</div>
					</div>
				</div>
			</div>
		</section>
	</main>
	<Footer />
</Layout>

<style>
	.dl-page { overflow-x: hidden; }

	.dl-hero {
		padding: 150px 0 60px;
		background: radial-gradient(circle at 50% 0%, #F0FDFD 0%, #FAFAFA 60%);
		text-align: center;
	}
	.dl-head { max-width: 720px; margin: 0 auto; }
	.dl-pill {
		display: inline-block;
		background: rgba(0, 144, 146, 0.1);
		color: var(--c-main);
		padding: 6px 16px;
		border-radius: 20px;
		font-weight: 700;
		font-size: 0.85rem;
		margin-bottom: 20px;
	}
	.dl-title {
		font-size: clamp(2rem, 5vw, 3.2rem);
		font-weight: 900;
		line-height: 1.2;
		color: var(--c-text);
		margin-bottom: 18px;
		letter-spacing: -0.5px;
	}
	.dl-sub {
		color: var(--c-text-muted);
		font-size: 1.15rem;
		max-width: 560px;
		margin: 0 auto;
	}

	/* Action cards */
	.dl-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
		max-width: 820px;
		margin: 48px auto 0;
	}
	.dl-card {
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 26px 28px;
		border-radius: 20px;
		text-decoration: none;
		text-align: right;
		transition: transform 0.25s ease, box-shadow 0.25s ease;
	}
	.dl-card:hover { transform: translateY(-5px); }
	.dl-card.primary {
		background: linear-gradient(135deg, var(--c-main), var(--c-main-dark));
		color: white;
		box-shadow: 0 20px 45px -12px rgba(0, 144, 146, 0.45);
	}
	.dl-card.secondary {
		background: white;
		color: var(--c-text);
		border: 1px solid rgba(0, 144, 146, 0.15);
		box-shadow: 0 18px 40px -16px rgba(0, 0, 0, 0.12);
	}
	.dl-card-icon {
		width: 56px; height: 56px;
		border-radius: 16px;
		display: flex; align-items: center; justify-content: center;
		flex-shrink: 0;
	}
	.dl-card.primary .dl-card-icon { background: rgba(255,255,255,0.18); color: white; }
	.dl-card.secondary .dl-card-icon { background: rgba(0,144,146,0.1); color: var(--c-main); }
	.dl-card-icon svg { width: 28px; height: 28px; }
	.dl-card-text { display: flex; flex-direction: column; }
	.dl-card-text strong { font-size: 1.2rem; font-weight: 800; margin-bottom: 4px; }
	.dl-card-text span { font-size: 0.9rem; opacity: 0.85; }

	/* Install steps */
	.dl-install { padding: 70px 0; background: white; }
	.dl-h2 {
		text-align: center;
		font-size: clamp(1.5rem, 3vw, 2rem);
		font-weight: 800;
		color: var(--c-text);
		margin-bottom: 40px;
	}
	.dl-steps {
		max-width: 640px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.dl-step {
		display: flex;
		align-items: center;
		gap: 18px;
		background: #F9FBFB;
		border: 1px solid rgba(0,144,146,0.08);
		border-radius: 16px;
		padding: 18px 22px;
	}
	.dl-step p { margin: 0; font-size: 1.05rem; color: var(--c-text); font-weight: 500; }
	.dl-num {
		width: 38px; height: 38px;
		flex-shrink: 0;
		background: var(--c-main);
		color: white;
		border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		font-weight: 800;
		font-family: var(--font-en);
	}
	.dl-ios-note {
		max-width: 640px;
		margin: 30px auto 0;
		text-align: center;
		color: var(--c-text-muted);
		font-size: 0.95rem;
		background: rgba(0,144,146,0.05);
		border-radius: 14px;
		padding: 16px 20px;
	}

	/* Stores */
	.dl-stores { padding: 20px 0 90px; background: white; text-align: center; }
	.dl-soon-label { color: var(--c-text-muted); font-size: 1rem; margin-bottom: 22px; }
	.store-buttons { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
	.official-badge {
		position: relative;
		display: inline-flex;
		align-items: center;
		background: black;
		border: 1px solid rgba(255,255,255,0.2);
		border-radius: 8px;
		padding: 8px 16px;
		color: white;
		text-decoration: none;
		direction: ltr;
		min-width: 160px;
		cursor: default;
	}
	.os-icon { width: 28px; height: 28px; margin-right: 10px; flex-shrink: 0; }
	.badge-text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.1; }
	.small-txt { font-size: 0.65rem; text-transform: uppercase; opacity: 0.8; }
	.big-txt { font-size: 1.1rem; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
	.soon-badge {
		position: absolute;
		top: -10px;
		right: -10px;
		background: rgba(255,255,255,0.18);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(255,255,255,0.45);
		color: #fff;
		font-family: var(--font-ar);
		font-size: 0.7rem;
		font-weight: 700;
		padding: 3px 10px;
		border-radius: 20px;
		line-height: 1.4;
		box-shadow: 0 2px 8px rgba(0,0,0,0.25);
	}

	@media (max-width: 768px) {
		.dl-hero { padding: 120px 0 40px; }
		.dl-actions { grid-template-columns: 1fr; gap: 16px; margin-top: 36px; }
		.dl-card { padding: 22px; }
	}
</style>
```

- [ ] **Step 2: Build and verify the page renders**

Run: `npm run build && ls dist/download/index.html`
Expected: path exists, exit 0.

Run: `grep -c 'my.docsera.app' dist/download/index.html`
Expected: ≥ `1`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/download.astro
git commit -m "feat(landing): dedicated /download page"
```

---

### Task 8: nginx APK serving rule + `public/downloads/` placeholder

**Files:**
- Modify: `nginx/default.conf` (add a `location /downloads/` block before `location /`)
- Create: `public/downloads/.gitkeep`

- [ ] **Step 1: Add the downloads location block**

In `nginx/default.conf`, immediately before the `location / {` block (currently line ~38), insert:

```nginx
    # APK distribution. Serve .apk as a forced download with the correct
    # Android package MIME type. The signed docsera.apk is uploaded into
    # this directory before go-live; until then this path returns 404.
    location /downloads/ {
        root /usr/share/nginx/html;
        default_type application/vnd.android.package-archive;
        add_header Content-Disposition "attachment";
        add_header Cache-Control "public, max-age=300";
    }

```

- [ ] **Step 2: Create the directory placeholder so it ships in the build**

Create `public/downloads/.gitkeep` with a single comment line:

```
# The signed docsera.apk is dropped into this directory before go-live.
```

- [ ] **Step 3: Verify the directory ships and nginx config is well-formed**

Run: `npm run build && ls -la dist/downloads/`
Expected: directory exists (contains `.gitkeep`).

Run: `grep -c 'vnd.android.package-archive' nginx/default.conf`
Expected: `1`.

- [ ] **Step 4: Commit**

```bash
git add nginx/default.conf public/downloads/.gitkeep
git commit -m "feat(landing): nginx APK download route + downloads dir"
```

---

### Task 9: Per-page titles/descriptions for features / about / help

**Files:**
- Modify: `src/pages/features.astro`, `src/pages/about.astro`, `src/pages/help.astro` (each `<Layout …>` opening tag only)

- [ ] **Step 1: Inspect the current `<Layout>` tag in each page**

Run: `grep -n '<Layout' src/pages/features.astro src/pages/about.astro src/pages/help.astro`
Expected: one match per file showing the current `title=` attribute.

- [ ] **Step 2: Set a distinct title + description on features.astro**

Replace that file's `<Layout title="…">` opening tag with:

```astro
<Layout
	title="عن التطبيق — DocSera"
	description="تعرّف على ميزات دوكسيرا: حجز المواعيد، المراسلة المشفّرة مع طبيبك، الملف الطبي للعائلة، ومتابعة التقارير واللقاحات."
	path="/features"
>
```

- [ ] **Step 3: Set a distinct title + description on about.astro**

Replace that file's `<Layout title="…">` opening tag with:

```astro
<Layout
	title="من نحن — DocSera"
	description="قصة دوكسيرا: مبادرة سورية لقيادة التحول الرقمي في الرعاية الصحية، تجمع بين أحدث التقنيات العالمية والاحتياجات المحلية."
	path="/about"
>
```

- [ ] **Step 4: Set a distinct title + description on help.astro**

Replace that file's `<Layout title="…">` opening tag with:

```astro
<Layout
	title="دليلك ومركز المساعدة — DocSera"
	description="أسئلة شائعة وإرشادات استخدام دوكسيرا — الحجز، الحساب، المراسلة، والملف الطبي. تواصل معنا إن احتجت مساعدة."
	path="/help"
>
```

(If any of these `<Layout>` tags spans multiple lines or has other attributes, preserve them; only add `description` and `path` and set the new `title`.)

- [ ] **Step 5: Build and verify distinct descriptions emit**

Run: `npm run build && grep -o 'name="description" content="[^"]*"' dist/features/index.html | head -1`
Expected: shows the features description (not the generic default).

- [ ] **Step 6: Commit**

```bash
git add src/pages/features.astro src/pages/about.astro src/pages/help.astro
git commit -m "feat(seo): per-page titles and descriptions"
```

---

### Task 10: Final visual verification (desktop + mobile)

**Files:** none (verification only)

- [ ] **Step 1: Start the preview server**

Run: `npm run build && npm run preview`
Expected: server starts (note the local URL, typically `http://localhost:4321`).

- [ ] **Step 2: Visually verify the homepage at desktop width**

Using the Playwright MCP browser tools: navigate to the homepage at 1440×900. Confirm:
- Navbar shows both buttons: "افتح تطبيق الويب" (filled) + "تحميل" (outline).
- Bottom CTA shows both action buttons + the two store cards each with a glass "قريباً" badge in the corner.
Take a screenshot for the record.

- [ ] **Step 3: Verify the homepage at mobile width**

Resize to 390×844. Open the mobile menu; confirm both links present ("افتح تطبيق الويب" + "تحميل التطبيق"). Confirm the bottom CTA buttons stack and store badges wrap cleanly. Screenshot.

- [ ] **Step 4: Verify the /download page at both widths**

Navigate to `/download` at 1440 and 390. Confirm: two action cards (web app + APK), the 4 install steps, the iOS note, and the soon store badges all render correctly in RTL. Screenshot each.

- [ ] **Step 5: Verify the nav links resolve**

Click "افتح تطبيق الويب" → should target `https://my.docsera.app`. Click "تحميل" → `/download`. Confirm no console errors and no remaining `#download` dead-jump from the Hero.

- [ ] **Step 6: Stop the server**

Stop the `npm run preview` process.

- [ ] **Step 7: Final confirmation (no separate commit needed)**

All task commits are already in place. Report the screenshots and any visual issues found; fix inline and amend the relevant task's commit if needed.

---

## Notes for the implementer

- **Elite-design bar:** match existing tokens and the glassmorphism aesthetic. If a button or badge looks off against the teal CTA background, adjust opacity/blur — don't introduce new colors outside the palette.
- **Go-live dependency (surface to the user):** the APK button (`/downloads/docsera.apk`) returns 404 until the signed `docsera.apk` is uploaded to `public/downloads/` (or directly into the deployed container's `/usr/share/nginx/html/downloads/`). This MUST be done before publishing the site.
- **Do not push.** The user controls deploy.
