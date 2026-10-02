# Study Ledger Design Guide

## Direction

The active Gavin's Grades experience should feel like a quiet, personal study ledger: dark charcoal surfaces, soft sage for progress, warm sand for emphasis, and clear editorial spacing. Keep the existing positive quest and DBZ badge identity, but use game language as a light accent rather than covering every page in arcade decoration.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| Paper | `#101310` | Site background |
| Surface | `#171c18` | Panels and cards |
| Raised surface | `#1d241f` | Inputs and grouped metrics |
| Ink | `#f0eee5` | Main text |
| Muted | `#a2a79d` | Supporting text |
| Line | `#303a32` | Dividers and quiet borders |
| Strong line | `#465348` | Input and focus boundaries |
| Sage | `#a6c4a7` | Positive progress and links |
| Sand | `#d0b783` | Labels, milestones, and secondary emphasis |
| Soft red | `#d89186` | Negative grade states |

These values are exposed as `--ledger-*` variables in `src/layouts/BaseLayout.astro` and `src/styles/global.css`.

## Type and layout

- Use DM Sans for page titles, body copy, controls, and cards. DM Mono is reserved for small data labels and compact numeric metadata; Orbitron remains an accent for the points total and grade figures.
- Set one clear page title, a short supporting line, then group related information with whitespace and thin dividers.
- Prefer a ledger row for repeated records. Use cards only when they group distinct tasks or a focused summary.
- Keep page content centered with a readable maximum width. On mobile, preserve safe-area spacing, allow labels to wrap, and avoid horizontal page scrolling.
- Use restrained radii, one-pixel borders, and soft shadows. Avoid pixel borders, glow, scanlines, and animated decoration on active pages.

## Interaction and accessibility

- Sage indicates an actionable or positive state; sand communicates a milestone or important secondary value. Never rely on color alone to communicate grade or assignment status.
- Links, buttons, selects, and inputs need visible keyboard focus and a comfortable touch target. Preserve semantic headings, labels, status text, and accessible modal behavior.
- Respect `prefers-reduced-motion`; transitions should clarify state, not decorate it.
- Maintain readable contrast for text and keep focus indicators distinct from panel borders.

## Page application

- `/grades`: the reference ledger list for current classes and grades.
- `/`: retain the points quest, opportunities, recovery actions, and badge link while using ledger surfaces and muted colors.
- `/classes/[classId]`: keep the assignment log factual, with clear status and impact actions.
- `/badges`: retain character artwork and collection progression; use the shared page frame and palette around the artwork.
- `/calculator`, `/stats`, and `/history`: keep their existing calculations and data visualizations while using consistent surfaces, controls, labels, and spacing.

## Reusable component patterns

```astro
<section class="ledger-panel" aria-labelledby="section-title">
  <p class="ledger-kicker">CURRENT PERIOD</p>
  <h2 id="section-title">Section title</h2>
  <div class="ledger-row">
    <span class="ledger-row-label">Label</span>
    <strong class="ledger-row-value">Value</strong>
  </div>
</section>
```

Use the site's existing page-specific classes where they already provide semantics. The snippet documents the hierarchy, not a required new component API.
