# Gavin's Grades — DBZ Design System Style Guide

This guide documents the visual design language used across the site. All reusable tokens and component classes live in `src/styles/twstyles.css`.

---

## Table of Contents

1. [Importing the Stylesheet](#importing-the-stylesheet)
2. [Design Tokens](#design-tokens)
   - [Colors](#colors)
   - [Typography Scale](#typography-scale)
   - [Spacing](#spacing)
   - [Borders](#borders)
3. [Typography Classes](#typography-classes)
4. [Backgrounds & Surfaces](#backgrounds--surfaces)
5. [Borders & Shadows](#borders--shadows)
6. [Layout Utilities](#layout-utilities)
7. [Components](#components)
   - [Panel](#panel)
   - [Chip / Badge](#chip--badge)
   - [Stat Card](#stat-card)
   - [Nav Link](#nav-link)
   - [Meter Bar](#meter-bar)
8. [Grade Colors](#grade-colors)
9. [Animations & Effects](#animations--effects)
10. [Responsive Breakpoints](#responsive-breakpoints)
11. [Font](#font)

---

## Importing the Stylesheet

```astro
---
import "../styles/twstyles.css";
// or also import global.css for Tailwind base
import "../styles/global.css";
---
```

> `global.css` sets up Tailwind 4 and the `font-player` theme token.  
> `twstyles.css` adds the DBZ component classes and design tokens on top.

---

## Design Tokens

All tokens are CSS custom properties set on `:root` and available everywhere.

### Colors

| Token | Hex | Use |
|---|---|---|
| `--dbz-orange` | `#f78a1d` | Primary accent — borders, chips, buttons |
| `--dbz-gold` | `#ffd24a` | Headings, stat values, panel titles |
| `--dbz-blue` | `#1a4fd6` | Secondary accent — nav links, timeline bars |
| `--dbz-red` | `#e4362a` | Danger / missing — scouter ring, active nav |
| `--dbz-ink` | `#0e0b0a` | Deepest background — stat blocks, header BG |
| `--dbz-steel` | `#1c222e` | Mid-dark surface |
| `--dbz-white` | `#ffffff` | Panel borders, text |
| `--grade-a` | `#01BC61` | A grade (green) |
| `--grade-b` | `#E6EF18` | B grade (yellow) |
| `--grade-c` | `#E69E18` | C grade (amber) |
| `--grade-d` | `#E66A78` | D grade (pink/red) |
| `--grade-f` | `#E60A18` | F grade (red) |

**Usage in CSS:**
```css
color: var(--dbz-gold);
border-color: var(--dbz-orange);
```

**Usage in Tailwind inline styles:**
```html
<span style="color: var(--dbz-gold);">9001</span>
```

---

### Typography Scale

All sizes are defined as `rem` tokens. The base font is `"Press Start 2P"` — a pixel/retro font — so sizes run smaller than typical web fonts.

| Token | Size | Typical Use |
|---|---|---|
| `--text-2xs` | `0.4rem` | Stat block micro-labels ("POWER LVL") |
| `--text-xs` | `0.5rem` | Scouter labels, fine print |
| `--text-sm` | `0.55rem` | Body small, class names, chips |
| `--text-base` | `0.65rem` | Normal body copy, panel foot |
| `--text-md` | `0.7rem` | Panel titles, row text |
| `--text-lg` | `0.8rem` | Stat values inside header blocks |
| `--text-xl` | `0.85rem` | Scouter readout value |
| `--text-2xl` | `1rem` | H2-level stat value |
| `--text-hero` | `clamp(1.6rem, 4vw, 2.8rem)` | Hero page title (responsive) |

---

### Spacing

| Token | Value | Use |
|---|---|---|
| `--space-1` | `4px` | Chip padding vertical |
| `--space-2` | `8px` | Chip padding horizontal, small gaps |
| `--space-3` | `12px` | Panel row gap, stat card padding |
| `--space-4` | `16px` | Standard margin, grid gap (mobile) |
| `--space-5` | `18px` | Panel padding |
| `--space-6` | `20px` | Hero stats margin-top |
| `--space-8` | `24px` | Standard grid gap |
| `--space-10` | `32px` | Section margin-top |

---

### Borders

| Token | Value |
|---|---|
| `--border-thin` | `2px` |
| `--border-normal` | `3px` |
| `--border-thick` | `4px` |

Letter spacing tokens:

| Token | Value |
|---|---|
| `--tracking-wide` | `0.18em` |
| `--tracking-wider` | `0.2em` |

---

## Typography Classes

```html
<!-- Hero page title -->
<h1 class="dbz-title">DRAGON BALL Z: SAIYAN TRAINING LAB</h1>

<!-- Section / panel heading -->
<div class="dbz-heading">Power Level Monitor</div>

<!-- Body copy -->
<p class="dbz-body">Power levels synced with actual class grades.</p>

<!-- Micro label above a stat value -->
<div class="dbz-label">POWER LVL</div>

<!-- Fine print / meta text -->
<span class="dbz-meta">Aura: Gold Burst</span>

<!-- Gold text glow effect -->
<h1 class="dbz-title dbz-glow-gold">SAIYAN ACADEMY</h1>
```

---

## Backgrounds & Surfaces

| Class | Description |
|---|---|
| `.bg-radar` | Full-page dark green radar — body background |
| `.bg-ink` | Pure `#0e0b0a` — stat blocks, header bg |
| `.bg-panel` | Semi-transparent near-black — panel cards |
| `.bg-hero` | Dark with blue tint — hero content area |
| `.bg-shell` | Gold+blue gradient — main content shell |

```html
<body class="bg-radar">
  <article class="dbz-panel bg-panel">...</article>
</body>
```

---

## Borders & Shadows

| Class | Description |
|---|---|
| `.dbz-border` | 3px solid white — standard panel border |
| `.dbz-border-orange` | 4px solid `--dbz-orange` — header |
| `.dbz-border-dashed` | 3px dashed orange — nav bar |
| `.dbz-border-gold` | 2px solid gold — highlight/fusion cards |
| `.dbz-border-hero` | 3px white + offset shadow — hero section |
| `.dbz-shadow` | Inset black + 10px drop — standard panel |
| `.dbz-shadow-lg` | Double ring + drop — main header |

```html
<div class="dbz-border dbz-shadow">Panel content</div>
<header class="dbz-border-orange dbz-shadow-lg">Header</header>
```

---

## Layout Utilities

### Container

```html
<div class="dbz-container"><!-- max-width: 1400px, centered --></div>
```

### Responsive Panel Grid

3 columns → 2 at ≤1024px → 1 at ≤640px:

```html
<div class="dbz-grid">
  <article class="dbz-panel">...</article>
  <article class="dbz-panel">...</article>
  <article class="dbz-panel">...</article>
</div>
```

### Stat Grid

Auto-fit columns with 180px minimum — used for hero stats rows:

```html
<div class="dbz-stat-grid">
  <div class="dbz-stat-card">...</div>
  <div class="dbz-stat-card">...</div>
</div>
```

### Panel Row

Flex row with dashed bottom divider:

```html
<div class="dbz-row">
  <span class="dbz-body">Greek Mythology</span>
  <span class="dbz-chip grade-a">92%</span>
</div>
```

---

## Components

### Panel

A bordered card with title and optional footer.

```html
<article class="dbz-panel">
  <div class="dbz-panel-title">Power Level Monitor</div>

  <div class="dbz-row">
    <span class="dbz-body">Math Class</span>
    <span class="dbz-chip grade-b">88%</span>
  </div>
  <div class="dbz-row">
    <span class="dbz-body">English</span>
    <span class="dbz-chip grade-a">95%</span>
  </div>

  <div class="dbz-panel-foot">Last synced: Q3</div>
</article>
```

---

### Chip / Badge

Small labeled badge with color variants.

```html
<!-- Default orange -->
<span class="dbz-chip">88%</span>

<!-- Color variants -->
<span class="dbz-chip dbz-chip-blue">Info</span>
<span class="dbz-chip dbz-chip-red">Missing</span>
<span class="dbz-chip dbz-chip-gold">Gold</span>

<!-- Grade-specific (auto color from letter) -->
<span class="dbz-chip grade-a">A</span>
<span class="dbz-chip grade-b">B</span>
<span class="dbz-chip grade-c">C</span>
<span class="dbz-chip grade-d">D</span>
<span class="dbz-chip grade-f">F</span>
```

---

### Stat Card

Three-line card: label / value / meta. Used in hero stats rows.

```html
<div class="dbz-stat-card">
  <span class="dbz-stat-label">Power Level</span>
  <span class="dbz-stat-value">9001</span>
  <span class="dbz-stat-meta">Overclocked</span>
</div>
```

---

### Nav Link

Navigation anchor with accent color variants and hover fill effect.

```html
<a href="/"          class="dbz-nav-link dbz-nav-gold">Earth HQ</a>
<a href="/stats"     class="dbz-nav-link dbz-nav-blue">Scouter Stats</a>
<a href="/calculator" class="dbz-nav-link dbz-nav-orange">Power Calculator</a>

<!-- Active / current page -->
<a href="/anime"     class="dbz-nav-link dbz-nav-red dbz-nav-active">Training Lab</a>
```

---

### Meter Bar

Animated power level fill bar.

```html
<div class="dbz-meter">
  <div class="dbz-meter-fill" style="width: 87%;"></div>
  <div class="dbz-meter-glow"></div>  <!-- scan sweep overlay -->
</div>
```

---

## Grade Colors

Text and background color helpers keyed to letter grade.

| Class | Color | Use |
|---|---|---|
| `.grade-a` / `.grade-a-bg` | `#01BC61` (green) | A |
| `.grade-b` / `.grade-b-bg` | `#E6EF18` (yellow) | B |
| `.grade-c` / `.grade-c-bg` | `#E69E18` (amber) | C |
| `.grade-d` / `.grade-d-bg` | `#E66A78` (pink/red) | D |
| `.grade-f` / `.grade-f-bg` | `#E60A18` (red) | F |

```html
<span class="grade-a">A+</span>
<div class="grade-b-bg" style="padding: 4px 8px;">B</div>
```

These text classes are also defined in `global.css` for Tailwind-based pages.

---

## Animations & Effects

Apply with utility classes or reference the `@keyframes` directly in your own CSS.

| Class | Effect |
|---|---|
| `.aura-pulse` | Slow scale pulse (4s) — glowing aura rings |
| `.scan-sweep` | Horizontal white shimmer sweep (3s) — meter glow |
| `.blink-dot` | Opacity + scale blink (2s) — dragon ball dots |
| `.blink` | Cursor blink step (1s) — the `_` in SAIYAN ACADEMY |
| `.dbz-glow-gold` | Gold text-shadow glow |
| `.dbz-glow-orange` | Orange box-shadow glow |

```html
<div class="aura-pulse" style="border: 2px solid var(--dbz-gold); ..."></div>
<span class="blink">_</span>
<h1 class="dbz-title dbz-glow-gold">POWER LEVEL</h1>
```

---

## Responsive Breakpoints

| Breakpoint | Width | Behavior |
|---|---|---|
| Desktop | > 1024px | 3-column `dbz-grid`, full padding |
| Tablet | ≤ 1024px | 2-column `dbz-grid` |
| Mobile | ≤ 640px | 1-column `dbz-grid`, reduced padding, smaller fonts |

All `dbz-panel`, `dbz-chip`, and `dbz-stat-card` components have built-in mobile adjustments — no extra classes needed.

---

## Font

The entire site uses **Press Start 2P** — a pixel/retro bitmap-style font from Google Fonts.

```html
<!-- In <head> — required for pages not using BaseLayout -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
```

Apply the font via the Tailwind theme token:

```html
<body class="font-player">
```

Or in CSS:

```css
font-family: "Press Start 2P", system-ui;
/* or */
font-family: var(--font-player);
```

> **Note:** Because Press Start 2P is a pixel font, font sizes run small. `1rem` looks like a large heading; `0.55rem` is normal body text. Always test at multiple sizes — the `--text-*` tokens reflect the actual values used throughout the design.
