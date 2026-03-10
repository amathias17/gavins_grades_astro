# Gavin's Grades

A retro-styled grade tracking web app built with Astro 5 + Tailwind 4. Scrapes assignment and grade data from Skyward and presents it as an RPG-inspired dashboard.

---

## Pages

| Route | Name | Description |
|-------|------|-------------|
| `/` | Home | Current grades for all classes, missing assignments, and quick stats |
| `/classes/[period]` | Class Detail | Assignment log, grade breakdown, and impact calculator for a single class |
| `/history` | Grade History | Per-class Q3 grade trend sparklines with weekly delta badges |
| `/stats` | Stats Room | Q3 average grade signal chart, best/toughest class highlights |
| `/calculator` | Calculator | Standalone grade impact calculator — what score do I need? |

---

## Getting Started

### 1. Install dependencies

```sh
npm install
```

### 2. Scrape grade data from Skyward

Grade data is pulled from Skyward using a Playwright-based scraper.

**Easiest way (Windows):** double-click `scraper\run-enhanced-scraper.bat`. It opens a terminal, runs the scraper, and waits so you can see the output.

**From PowerShell:**
```powershell
cd scraper
$env:SKYWARD_USERNAME="your_username"
$env:SKYWARD_PASSWORD="your_password"
node enhanced-scraper.cjs
```

**From the project root:**
```powershell
$env:SKYWARD_USERNAME="your_username"; $env:SKYWARD_PASSWORD="your_password"; node scraper/enhanced-scraper.cjs
```

The scraper will open a headless browser, log in to Skyward, and pull all Q3 assignments. It writes two files:
- `scraper/detailed-grades.json` — per-class assignment data used by the site at build time
- `scraper/detailed-grades-cache.json` — cache of already-scraped assignments (speeds up future runs)

> **Tip:** Add `$env:SKYWARD_MAX_ASSIGNMENTS=10` to cap assignments per class for a quick test run.

### 3. Start the dev server

```sh
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) in your browser.

---

## Updating Grade Data

Run the scraper, then restart the dev server (it reads the JSON files at startup):

```powershell
# From the scraper folder
cd scraper
$env:SKYWARD_USERNAME="your_username"
$env:SKYWARD_PASSWORD="your_password"
node enhanced-scraper.cjs

# Then back in the project root
cd ..
npm run dev
```

Or just double-click `scraper\run-enhanced-scraper.bat`, then refresh the browser.

---

## Commands

| Command | Action |
|---------|--------|
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server at `localhost:4321` |
| `npm run build` | Build production site to `./dist/` |
| `npm run preview` | Preview the production build locally |
| `npx playwright test` | Run E2E tests |

---

## Project Structure

```
/
├── public/               # Static assets
├── scraper/
│   ├── enhanced-scraper.cjs   # Skyward scraper (Playwright)
│   ├── detailed-grades.json   # Scraped output — read by the site at build time
│   └── detailed-grades-cache.json  # Assignment cache (gitignored)
├── src/
│   ├── components/       # Astro components (CurrentGrades, GradeCalculator, etc.)
│   ├── data/
│   │   ├── grades.json          # Grade history + per-class current grades
│   │   └── missing_assignments.json  # Missing/pending assignments
│   ├── layouts/          # BaseLayout (retro neon theme, nav)
│   ├── pages/            # One file = one route
│   ├── types/            # TypeScript types
│   └── utils/
│       └── gradeCalculator.ts  # Grade impact calculation utilities
├── tests/e2e/            # Playwright E2E tests
└── package.json
```

---

## Data Files

### `src/data/grades.json`
Maintained by the scraper. Contains:
- `classes` — current grade for each class (name, teacher, period, letter grade)
- `grade_history` — daily grade snapshots per class (used by `/history` and `/stats`)
- `overall_average`, `streak`, `average_history`

### `scraper/detailed-grades.json`
Per-class assignment details scraped from Skyward. Used on `/classes/[period]` pages for the assignment log and grade impact calculator.

### `src/data/missing_assignments.json`
Missing and past-due assignments. Shown on the home page as **Missing.Quests**.

---

## Notes

- Assignment scores showing `* out of X` in Skyward mean the assignment has not been graded yet. These appear as `0/X` in the UI.
- Grade history tracks Q3 only. The Q3 start is auto-detected per class from the grade history data.
- The scraper caches graded assignments to skip re-scraping on future runs. Ungraded (`*`) assignments are never cached so they get re-checked each run.
