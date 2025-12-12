# Grade Impact Calculator - Feature Documentation

## Overview

The **Grade Impact Calculator** is a "What-If" tool that allows students to simulate how hypothetical assignment scores would affect their overall class grade. This feature helps students make informed decisions about study priorities and understand the impact of upcoming assignments.

## User Interface

### Location
The calculator appears on individual class detail pages (`/classes/[classId]`), positioned between the class header and the assignments section.

### Design
The calculator follows the application's retro gaming aesthetic:
- **Theme**: Black background with neon green (#00ff00) accents
- **Icon**: 🎯 (Target/Bullseye)
- **Title**: "GRADE.IMPACT.CALCULATOR"
- **Style**: Border-heavy design matching existing components

### Inputs

| Field | Type | Validation | Description |
|-------|------|------------|-------------|
| **Score Earned** | Number (0.1 step) | 0-10000, no negatives | Points earned on hypothetical assignment |
| **Max Points** | Number (0.1 step) | 0.1-10000, must be > 0 | Maximum points possible for assignment |

### Outputs

When calculated, the tool displays:
1. **Current Grade**: Letter grade and percentage
2. **Projected Grade**: What the grade would become
3. **Delta**: Change amount with visual indicator
   - ▲ Green arrow for improvements (+0.5% or more)
   - ▼ Red arrow for declines (-0.5% or more)
   - ● Gray dot for insignificant changes
4. **Progress Bar**: Visual representation with retro animation

## How It Works

### Calculation Logic

The calculator uses two different strategies depending on available data:

#### With Assignment Data
When a class has detailed assignment information:
```typescript
projectedGrade = (totalEarnedPoints + hypotheticalScore) / (totalPossiblePoints + hypotheticalMaxPoints) × 100
```

#### Without Assignment Data
When only the class grade is available:
```typescript
// Treats current grade as if based on 100 points
projectedGrade = (currentGrade + hypotheticalScore) / (100 + hypotheticalMaxPoints) × 100
```

### Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Score > Max Points | Allowed (for extra credit), grade capped at 100% |
| Negative scores | Rejected with validation error |
| Zero max points | Rejected with validation error |
| Decimal values | Supported (e.g., 87.5/100) |
| Very large numbers | Validated, max 10,000 points |
| Empty inputs | Calculate button disabled |

## Accessibility Features

### Keyboard Navigation
- **Tab**: Navigate between inputs and buttons
- **Enter**: Submit form (calculate)
- **Spacebar**: Reset form

### Screen Reader Support
- All inputs have proper `<label>` elements
- Descriptive `aria-describedby` attributes
- Error messages announced via `role="alert"` and `aria-live="assertive"`
- Results announced via `role="status"` and `aria-live="polite"`
- Visual-only elements use `aria-hidden="true"`

### Focus Management
- Focus returns to first input after reset
- Error messages receive focus when displayed
- Logical tab order maintained

## Technical Implementation

### Files Created

1. **`src/utils/gradeCalculator.ts`**
   - Pure calculation functions
   - TypeScript interfaces
   - Input validation
   - No side effects, fully testable

2. **`src/components/GradeCalculator.astro`**
   - UI component
   - Client-side interactivity via `<script>` tag
   - Matches existing design system

3. **`tests/e2e/gradeCalculator.spec.ts`**
   - Comprehensive Playwright E2E tests
   - 12 test scenarios covering all functionality

4. **`playwright.config.ts`**
   - Test configuration
   - Multiple browser/device support
   - Auto-starts dev server

### Files Modified

1. **`src/pages/classes/[classId].astro`**
   - Imports `GradeCalculator` component
   - Renders calculator between header and assignments

### Dependencies

No new runtime dependencies added! Uses:
- Astro's built-in TypeScript support
- Native browser JavaScript
- Existing Playwright dev dependency

## Testing

### Running E2E Tests

```bash
# Run all tests
npx playwright test

# Run specific test file
npx playwright test gradeCalculator.spec.ts

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run tests in UI mode (interactive)
npx playwright test --ui

# Run tests in specific browser
npx playwright test --project=chromium
```

### Test Coverage

The E2E test suite includes 12 scenarios:

1. ✅ Component visibility
2. ✅ Basic calculation (90/100)
3. ✅ Improvement indicator (100/100)
4. ✅ Decline indicator (0/100)
5. ✅ Input validation (negative numbers)
6. ✅ Form reset
7. ✅ Button enable/disable state
8. ✅ Decimal value support
9. ✅ Keyboard navigation
10. ✅ Mobile viewport
11. ✅ Screen reader announcements
12. ✅ Extra credit handling

## Usage Examples

### Example 1: Improving a C to a B

**Scenario**: Student has a 75% (C) and wants to know what they need on the next assignment worth 100 points to get a B (80%).

**Steps**:
1. Navigate to class detail page
2. Enter "85" in Score Earned
3. Enter "100" in Max Points
4. Click "Calculate Impact"

**Result**: Shows projected grade and delta, allowing student to assess if 85/100 is achievable.

### Example 2: Extra Credit Opportunity

**Scenario**: Student has a 95% and can earn extra credit (110/100).

**Steps**:
1. Enter "110" in Score Earned
2. Enter "100" in Max Points
3. Click "Calculate Impact"

**Result**: Shows potential grade improvement, capped at 100%.

### Example 3: Damage Control

**Scenario**: Student missed an assignment (0/50) and wants to see the impact.

**Steps**:
1. Enter "0" in Score Earned
2. Enter "50" in Max Points
3. Click "Calculate Impact"

**Result**: Shows projected grade decline with red indicator.

## Development Commands

### Build & Dev

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Testing

```bash
# Run E2E tests
npx playwright test

# Install Playwright browsers (first time only)
npx playwright install
```

### Code Quality

```bash
# Type check (if @astrojs/check installed)
npx astro check

# Lint (if configured)
npm run lint
```

## Known Limitations

1. **Simplified Calculation**: Assumes equal weighting of all assignments. Does not support:
   - Weighted categories
   - Dropped scores
   - Grading curves
   - Extra credit multipliers

2. **Client-Side Only**: Calculations happen in the browser, no persistence.

3. **Read-Only**: Cannot modify actual grades (by design).

4. **Single Assignment**: Can only add one hypothetical assignment at a time.

## Future Enhancements

Potential improvements for future iterations:

- [ ] Support for weighted categories
- [ ] Multiple hypothetical assignments
- [ ] "What grade do I need?" reverse calculator
- [ ] Save/share scenarios
- [ ] Grade trend prediction
- [ ] Category-specific calculations
- [ ] Integration with missing assignments list

## Troubleshooting

### Calculator not appearing
- **Check**: Is this a class detail page (`/classes/[period]`)?
- **Solution**: Calculator only appears on individual class pages, not the main grades page.

### Calculate button disabled
- **Check**: Are both inputs filled?
- **Solution**: Both Score Earned and Max Points must have values.

### Results seem incorrect
- **Check**: Does the class have assignment data?
- **Solution**: Calculation differs based on available data. Classes without assignments use simplified model.

### E2E tests failing
- **Check**: Is dev server running on port 4321?
- **Solution**: Playwright auto-starts server, but ensure port is not in use.

## Support

For issues or questions:
1. Check this documentation
2. Review test files for usage examples
3. Examine source code comments in `src/utils/gradeCalculator.ts`
4. Open an issue on GitHub

---

**Generated with Claude Code**

Feature implemented: December 2025
