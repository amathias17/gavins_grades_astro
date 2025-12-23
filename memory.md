# Repository Memory

- Stack: Astro 5 + tailwindcss@4 via vite plugin, Press Start 2P font, retro neon green/black aesthetic; layout at src/layouts/BaseLayout.astro imports global.css.
- AGENTS.md cleaned of encoding artifacts and duplicate sections; tooling directives consolidated.
- AGENTS.md now states that unavailable MCPs must be explicitly noted, skipped, and replaced with closest local alternatives.
- Data: src/data/grades.json holds metadata/overall averages/grade_history; class_id may be missing (period used for routing); assignments optional per class. src/data/missing_assignments.json uses key missing_assignments and due_date strings carry encoding artifacts ("A??A??").
- Routes: / (index.astro) renders CurrentGrades with links to /classes/{period} plus missing assignments card; /classes/[classId].astro builds static paths from class_id or period, embeds GradeCalculator and assignments table with status chips, and pulls scraped assignments from scraper/detailed-grades.json when available (matching by period and normalized class name); /calculator (calculator.astro) is the new 2-column dashboard with class selector, form, and results panels; legacy prototypes live in src/pages/new.astro and old.astro.
- Routes: /lab (lab.astro) is a dev-only layout lab for visual experiments and is not linked in navigation.
- Routes: /stats (stats.astro) shows grade history stats with an SVG trend chart and class highlights.
- Navigation links to /stats are now in the header nav; the home dashboard no longer shows a Stats Room card.
- Components and utils: gradeCalculator.ts exports pure validation + calculateWithAssignments/calculateWithoutAssignments + getLetterGrade; deltas treated as meaningful only past +/-0.5. GradeCalculator.astro wires dataset props into client script for validation, accessibility messages, progress bar, and reset behavior. CurrentGrades.astro builds cards from grades data and missing_assignments, with Missing.Quests showing a dynamic count. GradeTable and gradeTrends components exist but are commented out on home.
- Grade calculators now render a calculation breakdown: current totals, hypothetical add, and projected totals, using new total fields from gradeCalculator.ts in both class and /calculator views.
- Class assignments normalize past-due pending items as missing with 0/total and include them in calculator totals.
- Missing assignment checkbox simulation now runs in an inline script with data-astro-rerun to ensure handlers rebind after view transitions.
- Missing.Quests cards on the home page open a modal showing projected class grade if the assignment is turned in at 100%, using scraped class points when available.
- new.astro now renders missing assignments data for layout preview.
- Missing.Quests modal now sets aria-hidden/aria-describedby and restores focus on close with a basic focus trap.
- Missing assignment dates strip "(Q2)" on display; skyward-scraper normalizes missing assignment due_date to drop quarter suffixes.
- BaseLayout enables Astro view transitions with ClientRouter in the page head.
- Testing: Playwright config uses npm run dev server at http://localhost:4321 with chromium/firefox/webkit and mobile devices; screenshots/traces on failure. E2E suites: tests/e2e/gradeCalculator.spec.ts (12 scenarios) and tests/e2e/calculatorDashboard.spec.ts (18 scenarios) covering calculator flows, accessibility, and responsive states. Artifacts stored in playwright-report/test-results.
- Docs and guidance: DELIVERABLES.md plus docs/IMPLEMENTATION_SUMMARY.md and docs/GRADE_CALCULATOR_FEATURE.md document the calculators; docs/CALCULATOR_DASHBOARD.md outlines the new /calculator page. .claude.md describes working norms (skip deepwiki, short sequential thinking, reuse design tokens/colors). README.md is the default Astro template with corrupted characters.
- Scraper and credentials: scraper/ contains Playwright scripts (skyward-scraper.cjs, investigate-assignments.cjs, enhanced-scraper.cjs) for Skyward; enhanced-scraper exhausts all moreAssignmentsEvents_* pagination links, filters Q2, opens showAssignmentInfo, and pulls Points Earned/Total Points/Due Date via document XPaths with dialog DOM fallbacks before closing sf_DialogClose, normalizing date fields to drop numeric-only or label-only values. Runtime sped up with headless launch, no slowMo, shorter waits, and dialog-visible/hidden waits. Adds graded-assignment cache at scraper/detailed-grades-cache.json (gitignored) to avoid re-scraping; "* out of x" stays uncached with earned=0/total preserved so new scores re-fetch. Raw output now carries class names plus due dates only (assignDate omitted), and organized output omits classes with no assignments. dueDate values are normalized to MM/DD/YYYY. .claude/settings.local.json stores allowed commands and SKYWARD_USERNAME/PASSWORD values. Avoid committing secrets and be cautious running scraper commands. Debug/test artifacts cleaned (dist/, playwright-report/, test-results/, debug images/html).
- Scraper supports SKYWARD_MAX_ASSIGNMENTS to cap assignment detail scraping for quick verification runs.
- Scraper fix (12/21/2025): extractAssignmentDetails now clicks by data-aid/data-gid instead of index; organizeByClass groups by classId first, yielding 9 separate classes. classIdMap now also attempts assignment row group-child/group-parent mapping with classDesc fallbacks so className/period/teacher can be restored; classId remains a last-resort fallback if mapping fails.
- Verified scraper output (12/22/2025): detailed-grades.json has 9 classes with names/periods/teachers; class pages match scraped assignments by period.
- Mobile layout: assignments log table now stacks into labeled cards on small screens using data-label cells; Category column removed.
- Assignment log percentages display as rounded whole numbers.
- Missing assignment simulation (12/23/2025): Class pages show checkboxes in a "Simulate" column for missing/pending assignments. When checked, assignments are simulated at 100% (full points) and grade updates automatically. A preview card shows simulated grade with delta. Calculator automatically recalculates if results are displayed. Client script tracks checked IDs, simulates assignments, updates calculator data attributes, and displays grade changes in real-time.
- Commands: npm run dev/build/preview; npx playwright test (installs browsers per playwright.config.ts). Data files include non-ASCII artifacts, so prefer ASCII in new edits.

## Working Agreement
- Any future change (add/remove/update feature, data, tooling, or process) must be reflected in this file immediately.
- When a feature is removed, delete its entry here; when added or changed, document the new behavior.
- Keep entries concise, ASCII-only unless existing section needs otherwise.
- You do not need user permission to edit, add, or remove files; proceed directly and reflect changes here.
- You may run necessary commands as needed (respecting existing safety constraints).
- Required tool order (use ALL MCPs sequentially; explicitly state what you learned from each):
- sequential-thinking: produce phases + acceptance criteria + "definition of done". Allow only 3-5 thoughts at a time.
- context7 + octocode: inspect repo structure, existing scraper/auth/session code, models (Course/Assignment/Category), caching/storage, and where calculator reads assignment data.
- astrodocs: confirm best practices for server-side data fetching/scraping patterns in Astro and where this logic should live.
- deepwiki: map grade domain rules that affect correctness (points vs %, weighting, dropped/exempt/missing, extra credit, rounding).
- playwright: open real class pages and identify where assignment data lives (network requests, GraphQL/REST responses, or DOM). Capture evidence: endpoints (paths only), response shapes, and robust selectors.

## Claude Code Best Practices (summary)
- Maintain Agents.md and memory.md as live context; keep concise actionable notes and update after changes.
- Gather targeted context before coding: use rg/ls to map files, read nearby relevant files, avoid over-fetching.
- Plan multi-step work when non-trivial; keep the plan updated; prefer small, incremental edits (apply_patch) to stay safe.
- Use fast local tools first; avoid destructive commands; protect secrets/data; adhere to existing style/theme and retro UI patterns.
- Validate changes with focused builds/tests for touched areas; add or adjust tests when behavior changes; report results clearly.
- Communicate succinctly: state assumptions, open questions, and next steps; reflect any feature/state changes here immediately.
- Added AGENTS.md with contributor guidelines: structure, commands, coding style, testing, commits/PRs, security, and memory rules.
- Combined AGENTS.md with prior memory.md guidance into a single Repository Guidelines document (structure, commands, style, testing, security, working agreement, tool order).
- Added scraper/fetch-graded-assignments.cjs: Playwright headless scraper to login, open gradebook, expand classes, toggle assignments, collect graded rows into scraper/graded-assignments.json (error screenshot on failure).
