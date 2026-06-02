# Landing page — download hub, web-app entry & launch polish

**Date:** 2026-06-02
**Repo:** docsera-landing (`docsera.app`)
**Context:** DocSera launches in Syria in 2 days as a **web app** (`my.docsera.app`) + **manual APK** download. App Store / Google Play are deferred (legal-entity procedure pending). The landing page must give visitors a clear path to the web app and the APK, honestly signal that the stores are coming, and look professional when shared.

## Problem

The current landing page has launch-blocking gaps:

1. **`#download` anchor goes nowhere** — the navbar (desktop + mobile) and Hero "حمل التطبيق" buttons all link to `#download`, but no element with that id exists. The primary CTA is dead.
2. **No web-app entry point** — the entire launch is web-first, yet nothing links to `my.docsera.app`.
3. **No APK download path** — no file, no `/downloads/` nginx rule, no MIME type, no UI.
4. **Dead store badges** — homepage badges are `href="#"` with no "coming soon" treatment, implying the stores are live.
5. **`/faq` 404** — `index.astro:303` links to `/faq`; the page is `/help`.
6. **No SEO / social metadata** — sharing `docsera.app` on WhatsApp/Telegram (the dominant channels in Syria) produces a bare, imageless link. No OG tags, no per-page titles, no `robots.txt`/`sitemap.xml`.

## Goals

- One clear, consistent story across the site: **use the web app now**, or **download the Android APK**, with **App Store / Google Play marked "قريباً"**.
- A shareable, dedicated **`/download`** page.
- All existing CTAs resolve — no dead anchors or 404s.
- Clean social-share previews and basic SEO.
- Elite visual quality consistent with the existing design language (teal `#009092`, Cairo font, glassmorphism, rounded cards).

## Non-goals

- Hosting the actual signed APK now — the **path is wired; the file is dropped in before go-live** (per user decision).
- Redesigning unrelated sections of the site.
- Changing the doctor/center deep-link pages' existing "قريباً" badges (they work).

## Design

### A. Two universal actions, applied consistently

Every surface offers the same two clear actions, web-app first (it works for 100% of visitors — Android, iOS, desktop):

| Action | Label | Destination | Style |
|---|---|---|---|
| Primary | افتح تطبيق الويب | `https://my.docsera.app` | filled teal |
| Secondary | تحميل / تحميل تطبيق أندرويد | `/download` page (or APK directly in the hub) | outline |

### B. New `/download` page — `src/pages/download.astro`

A shareable hub (`docsera.app/download`) using `Layout` + `Navbar` + `Footer`. Sections:

1. **Header** — "حمّل دوكسيرا" + short subtitle.
2. **Primary actions** — "افتح تطبيق الويب" → `my.docsera.app` (filled) and "تحميل تطبيق أندرويد (APK)" → `/downloads/docsera.apk` (outline).
3. **APK install steps** — 3–4 concise Arabic steps for installing an APK on Android (download → open file → allow installs from this source → install). Addresses the "unknown sources" friction.
4. **iOS note** — "نسخة iOS قريباً — استخدم تطبيق الويب الآن."
5. **Stores** — "متوفر قريباً على المتاجر" with the App Store + Google Play cards (same elite card design as the homepage) carrying the small glass "قريباً" badge, non-clickable.

### C. Navbar — `src/components/Navbar.astro`

Replace the single `#download` button with **two buttons**:
- Primary (filled teal pill): "افتح تطبيق الويب" → `https://my.docsera.app`
- Secondary (outline pill): "تحميل" → `/download`

Same two links in the mobile drawer. Must fit the existing `1fr auto 1fr` grid on desktop and collapse cleanly below 1024px.

### D. Hero — `src/components/Hero.astro`

Change the broken primary button "حمل التطبيق" (`#download`) → "افتح تطبيق الويب" → `https://my.docsera.app`. Keep the secondary "استكشف التطبيق" → `/features`. (Download is always reachable from the navbar + bottom CTA.)

### E. Homepage bottom CTA — `src/pages/index.astro` (`.final-cta`)

- Add `id="download"` to the section so any lingering `#download` anchors still resolve (defensive).
- Keep heading "ابدأ رحلتك الصحية اليوم" + "مستقبل الطب الرقمي، يبدأ في سوريا".
- Add the two action buttons (web app filled-white, APK outline-white) above the store badges.
- Convert the two `.official-badge` cards: **keep the current black card design**, remove the dead `href="#"`, make them non-clickable, and add a **small glass "قريباً" badge** (frosted light pill, top-corner of each card).
- Fix `/faq` → `/help` at `index.astro:303`.

### F. Store "soon" glass badge (shared style)

A small glassmorphism pill on each `.official-badge` card: semi-transparent white background, `backdrop-filter: blur`, subtle border, white "قريباً" text, positioned at the card's top corner. Reads cleanly on the black cards. Cards get `cursor: default`, `aria-disabled`, and no navigation. Used on both the homepage CTA and the `/download` page.

### G. APK hosting

- **`nginx/default.conf`** — add a `/downloads/` location serving `.apk` as `application/vnd.android.package-archive`, with `Content-Disposition: attachment` and a short cache:
  ```nginx
  location /downloads/ {
      root /usr/share/nginx/html;
      default_type application/vnd.android.package-archive;
      add_header Content-Disposition "attachment";
      add_header Cache-Control "public, max-age=300";
  }
  ```
- **`public/downloads/`** — create the directory with a `.gitkeep` placeholder so it ships in the build. The real `docsera.apk` is dropped here before go-live.
- **Go-live dependency (must document loudly):** until `docsera.apk` exists, the APK button 404s. The file must be uploaded before publishing. (No auto-detection is possible in a static build.)

### H. SEO / social metadata pass

- **`astro.config.mjs`** — set `site: 'https://docsera.app'` (enables canonical/sitemap URLs).
- **`Layout.astro`** — extend `Props` to accept `description` and optional `ogImage`/`canonicalPath`. Emit:
  - `<title>` + `<meta name="description">` (per page)
  - Open Graph: `og:title`, `og:description`, `og:image`, `og:url`, `og:type=website`, `og:locale=ar_AR`, `og:site_name=DocSera`
  - Twitter: `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`
  - `<link rel="canonical">`
  - Fix viewport → `width=device-width, initial-scale=1`
- **Per-page titles/descriptions** — set distinct Arabic title + description for `/`, `/features`, `/about`, `/help`, `/download`.
- **Share image** — `public/og-image.png`, 1200×630. Primary approach: composite the DocSera logo on a branded teal background. Fallback if Arabic text rendering in the build tool is unreliable: logo + latin "DocSera" wordmark + tagline only.
- **`public/robots.txt`** — allow all, reference the sitemap.
- **`public/sitemap.xml`** — static list of public pages (`/`, `/features`, `/about`, `/help`, `/download`, legal pages).

## Files touched

| File | Change |
|---|---|
| `src/pages/download.astro` | **new** — download hub page |
| `src/components/Navbar.astro` | two buttons (web app + download), desktop + mobile |
| `src/components/Hero.astro` | primary button → web app; fix dead anchor |
| `src/pages/index.astro` | `id="download"` + action buttons + glass "soon" badges + fix `/faq`→`/help` |
| `src/layouts/Layout.astro` | OG/Twitter/canonical meta, per-page props, viewport fix |
| `astro.config.mjs` | `site` URL |
| `nginx/default.conf` | `/downloads/` APK serving rule |
| `public/downloads/.gitkeep` | **new** — ensure dir ships |
| `public/og-image.png` | **new** — 1200×630 share image |
| `public/robots.txt` | **new** |
| `public/sitemap.xml` | **new** |

## Quality bar

Implementation uses the **frontend-design** skill's quality standard — the new `/download` page and the CTA/badge work must match the site's existing polish (teal palette, Cairo typography, glassmorphism, soft shadows, RTL correctness, mobile breakpoints). Verify with a `npm run build` and a local visual check at desktop + mobile widths before committing.

## Out of scope / follow-ups

- **Pro URL discrepancy** — landing links to `https://pro.docsera.app` (`index.astro:251`, `help.astro:404`), but the Pro readiness doc references `app.docsera.app`. Confirm the canonical Pro web URL and align (separate, non-blocking).
- Designing a richer App-Store-style screenshots gallery for `/download` (later).

## Success criteria

- No dead `#download` anchor, no `/faq` 404 anywhere.
- Web app reachable in ≤1 click from navbar, Hero, homepage CTA, and `/download`.
- APK button points at `/downloads/docsera.apk`; nginx serves it as a download once the file is present.
- App Store / Google Play shown with a clean glass "قريباً" badge, non-clickable.
- Sharing `docsera.app` (and `/download`) on WhatsApp renders a proper preview card with image, title, description.
- `npm run build` succeeds; site renders correctly at desktop and mobile widths in both visual check passes.
