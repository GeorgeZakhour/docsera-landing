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
├── layouts/
│   └── Layout.astro  # Main layout with global styles and CSS variables
└── pages/
    ├── index.astro   # Homepage
    ├── features.astro
    ├── about.astro
    └── help.astro
public/
├── images/           # App screenshots, icons, SVGs
└── shapes/           # Background SVG shapes
```

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

- Only 1 dependency (Astro) — keep it lightweight
- All styling is scoped CSS or global CSS variables — no CSS framework
- Brand colors and fonts must stay consistent with DocSera apps (`#009092` teal, Cairo/Montserrat)
- WebP-optimized images in `public/images/`
