# Study Ledger Component Library

This companion reference describes the reusable interface patterns used across active routes. Implementations remain in Astro components and page styles so data behavior stays close to its owner.

## Page frame

Use the shared `BaseLayout` for the charcoal canvas, typography, focus treatment, and responsive gutters. Center content within a comfortable reading width. Page intros use a small uppercase kicker, a plain-language heading, and concise context.

## Ledger list

Use for repeated classes, assignments, and history items. Align a short identifier, flexible title/details, and a right-aligned value. Separate rows with a hairline rule; on small screens, allow the details to wrap while keeping the value readable.

## Summary panel

Use a surface panel for a coherent summary, milestone, or focused workflow. Combine a restrained border and rounded corners with clear spacing. Avoid stacking a panel inside another panel unless the inner group represents a distinct action or state.

## Status and grade

Always pair status color with visible text such as `MISSING`, `NOT GRADED`, or a letter grade. Sage represents positive progress, sand represents attention or milestone context, and soft red is reserved for negative grade movement.

## Inputs and actions

Inputs use the raised surface, clear labels, readable DM Sans text, and a distinct focus ring. Primary actions use sage fill with dark text; secondary actions use a quiet outline. Keep button labels descriptive and retain existing keyboard and dialog behavior.

## Data visualizations

Charts stay subordinate to their labels and surrounding story. Use a thin sage series line, muted guides, and sand only for a meaningful highlight. Disable decorative animation when reduced motion is requested.

## Existing implementations

- Grade ledger: `src/pages/grades.astro`
- Shared shell and tokens: `src/layouts/BaseLayout.astro`, `src/styles/global.css`
- Home quest dashboard: `src/components/PayoutDashboard.astro`
- Class assignment log: `src/pages/classes/[classId].astro`
- Badge cards and collection: `src/components/BadgeCard.astro`, `src/pages/badges.astro`
