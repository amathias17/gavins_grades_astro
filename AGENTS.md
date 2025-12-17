# Repository Guidelines

## Project Structure & Data
- Astro 5 + Tailwind 4.1 (@tailwindcss/vite); layout in src/layouts/BaseLayout.astro imports src/styles/global.css and retro neon-green/black theme.
- Pages: src/pages/index.astro (dashboard), src/pages/classes/[classId].astro (per-class + GradeCalculator), src/pages/calculator.astro (dashboard-style calculator); legacy prototypes in src/pages/new.astro and src/pages/old.astro.
- Components in src/components/ (CurrentGrades.astro, GradeCalculator.astro, etc.); utilities in src/utils/gradeCalculator.ts; data in src/data/grades.json and src/data/missing_assignments.json (class_id may be absent; use period). Encoding artifacts exist; do not "clean" without source confirmation.
- Tests: Playwright E2E in tests/e2e/; reports under playwright-report/ and test-results/. Docs in docs/ and DELIVERABLES.md. Scraper scripts in scraper/ (Skyward login/data fetch). Build/test artifacts, debug screenshots, and temp outputs are not tracked (dist/, playwright-report/, test-results/, debug images/html).
- Scraper updates: scraper/enhanced-scraper.cjs now clicks sf_expander, exhausts all “Next …” pagination links (moreAssignmentsEvents_*) per class, filters Q2 assignments, opens showAssignmentInfo dialogs, extracts Points Earned, Total Points, and Weight, and closes via sf_DialogClose. Output remains detailed-grades.json (per class with assignment weights/points) plus raw. Graded assignments cache to scraper/detailed-grades-cache.json (gitignored) to skip re-scraping; pending “* out of x” stay uncached; raw output now includes class names plus assign/due dates.

## Build, Test, and Development
- npm install - install deps (Astro, Tailwind, Playwright).
- npm run dev - start dev server at http://localhost:4321.
- npm run build - production build; also type-checks.
- npm run preview - serve the built site locally.
- npx playwright test - run all E2E tests; add --headed or --ui as needed.

## Coding Style & UX
- TypeScript + ESM; avoid any. Reuse BaseLayout, design tokens, and getGradeColor helpers; keep retro border-heavy aesthetic. Prefer small incremental edits (apply_patch); stay ASCII unless the file already uses other characters.

## Testing Guidance
- Playwright is primary; add/adjust E2E when behavior changes. Place specs in tests/e2e/ and favor stable, accessible selectors. Build (npm run build) should pass before delivery; run targeted tests during iteration.

## Commit & PR Guidelines
- Commits: short, imperative summaries (e.g., "Add calculator dashboard test coverage").
- PRs: describe scope, tests run, and UI changes (include screenshots for UI tweaks); link issues when applicable.

## Security & Configuration
- Secrets live in .claude/settings.local.json (SKYWARD credentials) and scraper scripts; never commit or log secrets. Treat data files as sensitive student info.

## Working Agreement
- Any change (add/remove/update feature, data, tooling, or process) must be reflected in this file and memory.md immediately; remove entries when features are removed.
- No extra permission needed to edit/add/remove files or run necessary commands (respect safety constraints). Keep entries concise and ASCII unless existing content differs.

## Claude Code Practices (Summary)
- Maintain AGENTS.md and memory.md as live context; gather targeted context first (rg/ls; read nearby files). Plan multi-step work when non-trivial and prefer small, safe edits.
- Use fast local tools; avoid destructive commands; protect secrets/data; adhere to existing style/theme. Validate with focused builds/tests and report results clearly. Communicate assumptions, questions, and next steps; reflect state changes here immediately.

## Tooling Directives (from prior guidance)
- Required tool order when applicable: sequential-thinking (3-5 thoughts; phases + acceptance criteria + definition of done) -> context7 + octocode (repo structure, scraper/auth/session code, models, storage, calculator data) -> astrodocs (server-side data patterns) -> deepwiki (grade domain rules) -> playwright (inspect class pages/endpoints/selectors).
- 
## Working Agreement
- Any future change (add/remove/update feature, data, tooling, or process) must be reflected in this file immediately.
- When a feature is removed, delete its entry here; when added or changed, document the new behavior.
- Keep entries concise, ASCII-only unless existing section needs otherwise.
- You do not need user permission to edit, add, or remove files; proceed directly and reflect changes here.
- You may run necessary commands as needed (respecting existing safety constraints).
-Required tool order (use ALL MCPs sequentially; explicitly state what you learned from each):
-sequential-thinking: produce phases + acceptance criteria + "definition of done". Allow only 3-5 thoughts at a time. 
-context7 + octocode: inspect repo structure, existing scraper/auth/session code, models (Course/Assignment/Category), caching/storage, and where calculator reads assignment data.
-astrodocs: confirm best practices for server-side data fetching/scraping patterns in Astro and where this logic should live.
-deepwiki: map grade domain rules that affect correctness (points vs %, weighting, dropped/exempt/missing, extra credit, rounding).
-playwright: open real class pages and identify where assignment data lives (network requests, GraphQL/REST responses, or DOM). Capture evidence: endpoints (paths only), response shapes, and robust selectors.## Claude Code Best Practices (summary)
- Maintain Agents.md and memory.md as live context; keep concise actionable notes and update after changes.
- Gather targeted context before coding: use rg/ls to map files, read nearby relevant files, avoid over-fetching.
- Plan multi-step work when non-trivial; keep the plan updated; prefer small, incremental edits (apply_patch) to stay safe.
- Use fast local tools first; avoid destructive commands; protect secrets/data; adhere to existing style/theme and retro UI patterns.
- Validate changes with focused builds/tests for touched areas; add or adjust tests when behavior changes; report results clearly.
- Communicate succinctly: state assumptions, questions, and next steps; reflect state changes here immediately.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
