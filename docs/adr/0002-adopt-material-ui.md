# ADR 0002 — Replace Bootstrap with Material UI

- **Status:** Accepted (records the implemented frontend direction)
- **Date:** 2026-09-24 (documentation date)
- **Related documents:** [Frontend audit](../../Audit%20translate.md), sections 2.2 and 7.5; [application providers](../../src/client/app/App.tsx); [theme](../../src/client/app/theme.ts)

## Context

The original frontend used Bootstrap/React Bootstrap and application JSX transformed in the browser. Modernization moved the frontend into a React/TypeScript application built with Vite. Authentication, navigation, task ownership, and profile management also introduced more forms, feedback states, and dialogs than the original task list required.

We needed a consistent component system across these screens. Keeping unrelated Bootstrap conventions, new component styles, and custom interaction code together would increase the number of patterns contributors had to maintain.

This record explains the rationale for the implemented choice. Vite and TypeScript address build and typing concerns independently; adopting Material UI alone does not provide those improvements.

## Decision criteria

- Reusable React components for forms, navigation, task lists, alerts, and confirmation dialogs.
- Consistent typography, spacing, colors, and interaction states across features.
- A shared theme rather than repeated page-specific design decisions.
- Components that fit the TypeScript codebase and React Router navigation.
- A manageable amount of custom CSS and interaction code.
- Support for accessible interfaces, with application-level labels, focus behavior, and keyboard interaction still verified by the team.

## Options considered

### Keep or upgrade Bootstrap / React Bootstrap

This would preserve familiar styles and reduce immediate visual changes. It was a viable option, but we chose to standardize the growing interface around MUI's component and theme APIs rather than continue the Bootstrap styling approach.

### Adopt Material UI

MUI provides the component vocabulary used by the new screens: buttons, text fields, alerts, application bars, lists, papers, and dialogs. A shared theme establishes application-wide defaults, while component-level styling handles local layout needs. This fits the React component structure already being introduced.

The costs are additional dependencies, Emotion styling, learning MUI conventions, and accepting a recognizable Material design starting point.

### Build a custom component system

This would give us full visual control but require us to own more component behavior, styling, and accessibility work. That effort is disproportionate to the application's current needs.

## Decision

**Use Material UI as the shared UI component system, replacing Bootstrap/React Bootstrap in the modernized frontend.**

Use `ThemeProvider` and `CssBaseline` at the application root. Keep global design choices in `src/client/app/theme.ts`, reusable feature components in `src/client/features`, and route-level composition in `src/client/pages`.

Prefer MUI components and theme-aware styling for new UI. Retain focused CSS where it serves feature-specific layout or behavior; adopting MUI does not require rewriting every style as a component prop. Use React Router links for internal navigation, including links rendered through MUI components.

## Consequences

### Benefits

- Auth, profile, navigation, and task screens share visual and interaction conventions.
- Theme changes can update defaults across the application in one place.
- Contributors can reuse existing components instead of implementing basic controls and dialogs repeatedly.
- The frontend no longer needs to maintain Bootstrap as a second component system.

### Costs and limits

- MUI and Emotion add dependencies and frontend bundle cost; imports and build output still need review.
- Contributors must learn MUI component APIs, theming, and styling conventions.
- Local overrides can undermine consistency if they bypass the shared theme too often.
- A component library does not guarantee accessibility. Labels, error messages, contrast, keyboard navigation, and dialog behavior remain our responsibility.
- This decision changes presentation and component composition; backend API contracts and authorization remain separate concerns.

## Implementation and verification

The current root installs `ThemeProvider` and `CssBaseline`. The theme defines the background, font stack, and border radius. Navigation, authentication screens, task controls, and the unassigned-task list use MUI components and icons.

For UI changes, run the frontend type checks, relevant tests, and production build. Review the affected screens at narrow and wide widths, including loading, empty, validation-error, and failure states. Check keyboard navigation and accessible labels for interactive controls.

## Revisit this decision if

- Product design requirements require extensive overrides of the component system.
- Measured bundle or rendering costs become unacceptable.
- Accessibility or maintenance requirements cannot be met with the selected components.
