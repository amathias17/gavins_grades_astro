# Repository Guidelines

## Project Structure & Data
- Astro 5 + Tailwind 4.1 (@tailwindcss/vite); layout in src/layouts/BaseLayout.astro imports src/styles/global.css and retro neon-green/black theme.
- Pages: src/pages/index.astro (dashboard), src/pages/classes/[classId].astro (per-class + GradeCalculator), src/pages/calculator.astro (dashboard-style calculator), src/pages/stats.astro (grade history stats); legacy prototypes in src/pages/new.astro and src/pages/old.astro.
- Layout lab lives at src/pages/lab.astro for dev-only visual experiments and is not linked in navigation.
- Class pages read scraped assignment data from scraper/detailed-grades.json at build time when available, matching by period and normalized class name.
- Components in src/components/ (CurrentGrades.astro, GradeCalculator.astro, etc.); utilities in src/utils/gradeCalculator.ts; data in src/data/grades.json and src/data/missing_assignments.json (class_id may be absent; use period). Encoding artifacts exist; do not "clean" without source confirmation.
- Grade impact calculators now show a calculation breakdown with current totals, hypothetical add, and projected totals on class pages and /calculator.
- CurrentGrades missing quests card shows a dynamic Missing.Quests count sourced from missing_assignments.json.
- Tests: Playwright E2E in tests/e2e/; reports under playwright-report/ and test-results/. Docs in docs/ and DELIVERABLES.md. Scraper scripts in scraper/ (Skyward login/data fetch). Build/test artifacts, debug screenshots, and temp outputs are not tracked (dist/, playwright-report/, test-results/, debug images/html).
- Scraper updates: scraper/enhanced-scraper.cjs now clicks sf_expander, exhausts all "Next" pagination links (moreAssignmentsEvents_*) per class, filters Q2 assignments, opens showAssignmentInfo dialogs, and pulls Points Earned/Total Points/Due Date via document XPaths with dialog DOM fallbacks before closing via sf_DialogClose. Date fields are normalized to drop numeric-only or label-only values. Runtime sped up with headless launch, no slowMo, shorter waits, and dialog-visible/hidden waits instead of fixed sleeps. Output remains detailed-grades.json (per class with assignment weights/points) plus raw. Graded assignments cache to scraper/detailed-grades-cache.json (gitignored) to skip re-scraping; "* out of x" are kept as 0/out-of-X and left uncached until graded; raw output now includes class names plus due dates; organized output omits classes with no assignments. ClassId mapping now also uses assignment row group-child/group-parent attributes with classDesc lookups to restore className/period/teacher after expansion.
- Scraper supports SKYWARD_MAX_ASSIGNMENTS to cap assignment detail scraping for quick checks.
- Scraper outputs omit assignDate and normalize dueDate to MM/DD/YYYY format.
- Scraper fix (12/21/2025): extractAssignmentDetails now clicks assignments by unique data attributes (data-aid, data-gid) instead of DOM index to prevent mis-matching after pagination. organizeByClass groups by classId first, correctly separating 9 classes instead of lumping all into one. classIdMap now also attempts assignment row group-child/group-parent mapping with classDesc fallbacks; classId may still be used as a last resort if no mapping is available. See issue gavins_grades_astro-orf.

## Build, Test, and Development
- npm install - install deps (Astro, Tailwind, Playwright).
- npm run dev - start dev server at http://localhost:4321.
- npm run build - production build; also type-checks.
- npm run preview - serve the built site locally.
- npx playwright test - run all E2E tests; add --headed or --ui as needed.

## Coding Style & UX
- TypeScript + ESM; avoid any. Reuse BaseLayout, design tokens, and getGradeColor helpers; keep retro border-heavy aesthetic. Prefer small incremental edits (apply_patch); stay ASCII unless the file already uses other characters.
- Assignments log table uses a mobile card layout at small breakpoints for readability; Category column removed.
- Assignments log percentage display rounds to whole numbers.
- Primary navigation lives in src/components/Header.astro with links to Home, Stats Room, and Calculator plus placeholders for future pages.

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

## Tooling Directives
- Required tool order (use ALL MCPs sequentially; explicitly state what you learned from each):
- sequential-thinking: produce phases + acceptance criteria + "definition of done". Allow only 3-5 thoughts at a time.
- context7 + octocode: inspect repo structure, existing scraper/auth/session code, models (Course/Assignment/Category), caching/storage, and where calculator reads assignment data.
- astrodocs: confirm best practices for server-side data fetching/scraping patterns in Astro and where this logic should live.
- deepwiki: map grade domain rules that affect correctness (points vs %, weighting, dropped/exempt/missing, extra credit, rounding).
- playwright: open real class pages and identify where assignment data lives (network requests, GraphQL/REST responses, or DOM). Capture evidence: endpoints (paths only), response shapes, and robust selectors.
- If any required MCP is unavailable in the current environment, note it explicitly, skip that step, and proceed with the closest local alternative (repo files, tests, or documented assumptions).

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**
```bash
bd ready --json
```

**Create new issues:**
```bash
bd create "Issue title" -t bug|feature|task -p 0-4 --json
bd create "Issue title" -p 1 --deps discovered-from:bd-123 --json
bd create "Subtask" --parent <epic-id> --json  # Hierarchical subtask (gets ID like epic-id.1)
```

**Claim and update:**
```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**
```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`
6. **Commit together**: Always commit the `.beads/issues.jsonl` file together with the code changes so issue state stays in sync with code state

### Auto-Sync

bd automatically syncs with git:
- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### GitHub Copilot Integration

If using GitHub Copilot, also create `.github/copilot-instructions.md` for automatic instruction loading.
Run `bd onboard` to get the content, or see step 2 of the onboard instructions.

### MCP Server (Recommended)

If using Claude or MCP-compatible clients, install the beads MCP server:

```bash
pip install beads-mcp
```

Add to MCP config (e.g., `~/.config/claude/config.json`):
```json
{
  "beads": {
    "command": "beads-mcp",
    "args": []
  }
}
```

Then use `mcp__beads__*` functions instead of CLI commands.

### Managing AI-Generated Planning Documents

AI assistants often create planning and design documents during development:
- PLAN.md, IMPLEMENTATION.md, ARCHITECTURE.md
- DESIGN.md, CODEBASE_SUMMARY.md, INTEGRATION_PLAN.md
- TESTING_GUIDE.md, TECHNICAL_DESIGN.md, and similar files

**Best Practice: Use a dedicated directory for these ephemeral files**

**Recommended approach:**
- Create a `history/` directory in the project root
- Store ALL AI-generated planning/design docs in `history/`
- Keep the repository root clean and focused on permanent project files
- Only access `history/` when explicitly asked to review past planning

**Example .gitignore entry (optional):**
```
# AI planning documents (ephemeral)
history/
```

**Benefits:**
- Clean repository root
- Clear separation between ephemeral and permanent documentation
- Easy to exclude from version control if desired
- Preserves planning history for archeological research
- Reduces noise when browsing the project

### CLI Help

Run `bd <command> --help` to see all available flags for any command.
For example: `bd create --help` shows `--parent`, `--deps`, `--assignee`, etc.

### Important Rules

- Use bd for ALL task tracking
- Always use `--json` flag for programmatic use
- Link discovered work with `discovered-from` dependencies
- Check `bd ready` before asking "what should I work on?"
- Store AI planning docs in `history/` directory
- Run `bd <cmd> --help` to discover available flags
- Do NOT create markdown TODO lists
- Do NOT use external issue trackers
- Do NOT duplicate tracking systems
- Do NOT clutter repo root with planning documents

For more details, see README.md and QUICKSTART.md.

## Claude Code Best Practices (summary)
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
