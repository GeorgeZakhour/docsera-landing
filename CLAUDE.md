# DocSera Landing — Marketing Website

## Project Overview

Static marketing/landing page for DocSera. Built with Astro, served via Nginx in Docker. Arabic-first design with full RTL support.

## Tech Stack

- **Framework**: Astro 5.16.6 (static site generator)
- **Language**: TypeScript (strict)
- **Styling**: Scoped CSS in Astro components + global CSS variables in Layout
- **Deployment**: Docker (multi-stage: Node 22-Alpine build → Nginx-Alpine serve)
- **CI/CD**: GitHub Actions → builds and pushes to GHCR on push to `main`

## Project Structure

```
src/
├── components/       # Astro components (Navbar, Hero, Features, Footer, etc.)
│   ├── StoreBadges.astro  # the two official store badges — the only place they are drawn
│   ├── AppBar.astro       # "get the app" bar for Android / in-app browsers
│   └── EntityCta.astro    # install → open-in-app block shared by doctor + center pages
├── config/
│   ├── links.ts      # every store / APK / web-app / social URL, playUrl(), proWhatsAppUrl()
│   └── pro-join.ts   # the Pro request form's closed lists and copy
├── scripts/          # browser modules shared between pages (analytics, entity CTA, Pro request form)
├── layouts/
│   └── Layout.astro  # Main layout with global styles and CSS variables
└── pages/
    ├── index.astro   # Homepage
    ├── download.astro
    ├── doctor.astro  # single shell for every /doctor/<token> (nginx try_files)
    ├── center.astro  # single shell for every /center/<id>
    ├── pro/          # DocSera Pro page + /pro/join request form (own <html>, do not use Layout)
    ├── features.astro
    ├── about.astro
    └── help.astro
public/
├── .well-known/      # iOS + Android app-link association files
├── images/           # App screenshots, icons, SVGs
│   └── badges/       # official App Store / Google Play artwork, unmodified
└── shapes/           # Background SVG shapes
nginx/                # server config: single-shell routes, short links, APK aliases
```

## App links and store badges

The patient app is on the App Store and Google Play (since 2026-10-06).

- **Never write a store URL in a page.** Import it from `src/config/links.ts`.
- **Never draw a store badge.** Use `<StoreBadges />`. The SVGs in `public/images/badges/`
  are Apple's and Google's own artwork; both brands forbid redrawing, recolouring or
  resizing one badge smaller than the other.
- `Layout.astro` sets `<html data-os="ios|android|desktop">` before first paint. Use it
  (or `adaptive` on `StoreBadges`) instead of sniffing the user agent again.
- Google Play links carry an install referrer (`playUrl()`); the patient app reads it. The
  key names are a contract with the app — see DocSera `docs/launch/80-…`.
- `public/.well-known/apple-app-site-association` must name the App Store build's real
  app id (`<team>.<bundle>`). When the publishing account changes, this file changes.
- The doctor / center pages must stay usable when the profile request fails: buttons are
  wired from the URL alone, before the fetch. Do not gate them on the response again.
- Pages are previewed against the real image: `docker build -t docsera-landing-preview . &&
  docker run -p 127.0.0.1:8091:80 docsera-landing-preview` (the dev server cannot route
  `/doctor/<token>` and does not apply the nginx redirects).

## Pro request form (`/pro/join`)

The two main buttons on `/pro` open a three-step form instead of WhatsApp. A sent request
lands in a founder-only inbox in DocSera-Admin. Design and contracts: DocSera-Pro
`docs/superpowers/specs/2026-10-11-pro-join-requests-design.md` and
`docs/superpowers/plans/2026-10-11-pro-join-requests.md`.

- **Files**: `src/pages/pro/join.astro` (markup, styles) · `src/scripts/pro-join.ts` (the
  send path and the page controller) · `src/scripts/pro-join-validate.ts` (field rules,
  pure) · `src/config/pro-join.ts` (lists, copy).
- **The server is one endpoint**: `POST {SUPABASE_URL}/functions/v1/pro_join_request` with
  the anon key — an edge function in DocSera-Pro. Every outcome is HTTP 200:
  - `{action:"open"}` → `{open:true, token}` or `{open:false}`
  - `{action:"submit", token, hp, source, cta, form}` → `{status}`: `accepted` (+ `code`) ·
    `invalid` (+ `fields`) · `retry` · `busy` · `closed`
- **Closed means WhatsApp only.** On page load, an answer that is not 200, or `open:false`,
  replaces the form with a WhatsApp panel. That is what makes it safe to deploy this site
  before the server, or with the flag `pro_join_form_enabled` off. A request that could
  not be made at all (offline, timeout) keeps the form; the token is asked for on send.
- **Tokens.** The server answers `retry` for a token younger than 4 s or older than 2 h.
  The page never sends one younger than 4 s; on `retry` it fetches a new one, waits, and
  resends once. Do not shorten that wait.
- **The field rules exist three times and change together**: `pro-join-validate.ts` here,
  `supabase/functions/pro_join_request/validate.ts` in DocSera-Pro, and the CHECK
  constraints on `pro_join_requests` (the DocSera-Pro migration). Role keys,
  the 14 governorates (spelling included), scheduling keys and interest keys in
  `src/config/pro-join.ts` are part of the rule. The specialty list is not: the request
  stores the label as text. This copy is the strict one on purpose — whatever it lets
  through, the other two accept.
- **Honeypot**: the hidden input `name="reference"`, sent as `hp`. A filled honeypot is
  answered `accepted` and dropped by the server, so never give it a name a browser
  autofills (website, email, company, address).
- **Tests**: `npm test` — `node:test` on the `.ts` files directly (Node 22.18+), no
  dependency. That is why these modules import each other with the `.ts` extension, and
  why `pro-join.ts` must not import `reach.ts` (it reads `import.meta.env` when loaded);
  the page hands it the endpoint, the key and `fireBeacon`.
- **Trying it locally**: the dev server and a plain build talk to the PRODUCTION API — a
  local submit is a real request in the founder's inbox. Build against staging:
  `PUBLIC_SUPABASE_URL=https://api-staging.docsera.app npm run build && npm run preview`.
- **Copy**: never state a trial length, here or on `/pro`. Arabic uses «».
- The Pro WhatsApp number is `PRO_WHATSAPP_NUMBER` in `links.ts`; build links with
  `proWhatsAppUrl(text)`.
- Funnel beacons through `fireBeacon`, category `acquisition`, never any personal data:
  `pro_join_opened`, `pro_join_step`, `pro_join_submitted`, `pro_join_whatsapp`.

## Design System

### CSS Variables
```css
--c-main: #009092       /* Primary teal — same as DocSera apps */
--c-main-dark, --c-main-light
--c-orange, --c-sand
--c-text, --c-text-muted, --c-white
--font-ar               /* Cairo (Arabic) */
--font-en               /* Montserrat (English) */
```

### Fonts
- **Arabic**: Cairo (400, 600, 700, 800)
- **English**: Montserrat (400, 500, 600, 700)
- Same font families as DocSera and DocSera-Pro apps

### Layout
- `dir="rtl"` — Arabic-first, right-to-left
- Mobile-first responsive with `clamp()` fluid typography
- Desktop: 16px base, Mobile (≤768px): 14px base

### Visual Effects
- Glassmorphism (backdrop-filter blur)
- Scroll-triggered animations
- Custom keyframe animations (float, fade-up)
- Responsive carousel

## Commands

```bash
npm run dev       # Development server
npm run build     # Build to ./dist/
npm run preview   # Preview production build
npm test          # Unit tests for the Pro request form (node:test, Node 22.18+)
```

## Deployment

- Dockerfile: multi-stage build → Nginx serves static files on port 80
- GitHub Actions (`.github/workflows/docker.yml`): builds Docker image, pushes to `ghcr.io/{owner}/docsera-landing:latest` on push to `main`

## Important Notes

- Two dependencies (Astro, qrcode-generator) — keep it lightweight
- All styling is scoped CSS or global CSS variables — no CSS framework
- Brand colors and fonts must stay consistent with DocSera apps (`#009092` teal, Cairo/Montserrat)
- WebP-optimized images in `public/images/`
