# Flow makeover with shadcn and light/dark mode

Status: Complete. Approved and verified in chat on 2026-10-03.

## Agreed behavior

1. Give all Flow surfaces the appearance of shadcn preset `b3kK6Twjw`: Base UI Nova, taupe surfaces, pink accents, Inter typography, Lucide icons, and default radius. Use actual Flow-owned shadcn components.
2. Preserve the explorer/canvas/inspector arrangement, all 15 repo routes, searchable repo navigation, filters, schema data, graph geometry, keyboard interactions, and existing workspace changes.
3. Use one shared navbar with a light/dark Switch. Follow device appearance until the user chooses a theme; remember that choice across navigation and reloads. Apply appearance before first paint and update React Flow without losing graph state.
4. Restyle cards, tables, connections, boundaries, toolbars, minimap, mobile sheets and every inspector tab. Semantic owner/connection colors remain distinct in both themes.

## Implementation

1. Configure Tailwind's Vite integration and local shadcn generation in `flow`; apply the complete preset and add only used components.
2. Consolidate navbar and theme handling, retaining the recently added searchable Base UI combobox.
3. Replace the dark-only stylesheet with preset tokens and shared layout styling. Convert explorer, navigation, inspector and diagram controls to generated components.
4. Make every canvas color respond to the active appearance, preserving node sizes, positions, selection and viewport.
5. Update Flow's README with preset and theme behavior. No framework contract or schema changes, new domain terms, or ADR are needed.

## Verification

1. Run Flow's Nx typecheck, lint, tests, build and format check.
2. Inspect overview and repo pages in light and dark, including all inspector tabs and graph surfaces.
3. Exercise repo search/navigation, owner and connection filters, empty state, fit/locate, pan/zoom and selection.
4. Check device defaults, live device changes before explicit choice, persistence after choice, reload, blocked storage and state preservation while switching.
5. Check mobile sheets, desktop layout, keyboard/Escape/focus restoration, reduced motion and readable contrast. Capture representative screenshots.

## Outcome

1. Applied the official preset through shadcn's Vite workflow. Flow owns its generated Base UI components, dependencies, Tailwind integration and Inter fonts. Removed the superseded dark-only styling and unused generated components.
2. Added the shared navbar and binary theme provider with synchronous prepaint initialization, remembered explicit preference, device-change subscription and matching browser theme metadata. React Flow uses the resolved appearance without resetting selection, filters, inspector tabs or viewport.
3. Converted filters, navigation, diagram controls, cards and inspectors to the generated components. Added accessible mobile explorer and inspector sheets. Routes, schema metadata, graph geometry and framework APIs remain unchanged.
4. Updated Flow's README with appearance, theme behavior and local configuration.

## Verification outcome

1. `pnpm nx run-many -t typecheck lint test build format:check -p flow` passed. All 15 tests in three files passed, including device defaults, explicit preference, blocked storage and persistence. After removing an unused generated textarea, the affected typecheck, lint, build and format checks passed again. Nx Cloud reported an unrelated access error after the successful local checks.
2. Browser checks covered light and dark overview and repo pages, table schema/indexes, Rows and Source tabs, entity inspection, searchable repo navigation by keyboard and pointer, owner/connection filters, empty state, fit/locate, pan/zoom and selection. No browser console errors were present.
3. Verified device defaults and live appearance changes on a fresh origin, explicit choices surviving device changes, navigation and reload, and unchanged selection, inspector tab, filters and viewport during theme switching. Initial class and browser theme metadata are set synchronously before the app loads.
4. Checked desktop at 1280×900 and mobile at 390×844, with no horizontal overflow. Explorer and inspector sheets dismiss with Escape and restore focus; keyboard repo navigation and manual-activation tabs work. Reduced motion removes transitions and animated fit duration. Semantic colors remain distinguishable in both appearances.
5. Captured representative light/dark overview and table screenshots, plus a mobile dark overview. Temporary device emulation and viewport overrides were cleared after verification.

## Remaining work

None.
