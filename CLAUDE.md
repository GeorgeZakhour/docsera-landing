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
│   └── links.ts      # every store / APK / web-app / social URL, and playUrl()
├── scripts/          # browser modules shared between pages (analytics, entity CTA)
├── layouts/
│   └── Layout.astro  # Main layout with global styles and CSS variables
└── pages/
    ├── index.astro   # Homepage
    ├── download.astro
    ├── doctor.astro  # single shell for every /doctor/<token> (nginx try_files)
    ├── center.astro  # single shell for every /center/<id>
    ├── pro/          # DocSera Pro page (own <html>, does not use Layout)
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
```

## Deployment

- Dockerfile: multi-stage build → Nginx serves static files on port 80
- GitHub Actions (`.github/workflows/docker.yml`): builds Docker image, pushes to `ghcr.io/{owner}/docsera-landing:latest` on push to `main`

## Important Notes

- Two dependencies (Astro, qrcode-generator) — keep it lightweight
- All styling is scoped CSS or global CSS variables — no CSS framework
- Brand colors and fonts must stay consistent with DocSera apps (`#009092` teal, Cairo/Montserrat)
- WebP-optimized images in `public/images/`
