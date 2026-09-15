# 016 — Bricks app: permanent bottom drawer with horizontal group filmstrip

## Goal

In the bricks sandbox app, always present brick browsing as a bottom drawer (all viewports). Open it from the floating grid toolbar; close it with a studio-style header X. On the groups list route, show groups as a horizontally scrollable filmstrip.

## Non-goals

- Embla / carousel snap for groups
- Changing brick drag MIME, `DraggableBrick`, or catalog data models
- Redesigning nested group/catalog configuration routes into the filmstrip
- Porting this shell to studio (studio already has its own drawer/header patterns)

## Shell

- Remove the desktop (≥1024) fixed left half-panel and the `isDesktop` layout branch in `SandboxLayout`.
- Always use the existing non-modal Vaul bottom drawer for brick browsing.
- Open via the floating toolbar **Bricks** control on all viewports.
- Close via a drawer header **X** with `aria-label="Close drawer"` (studio `BrickGroup` pattern), not only the current drag-handle chrome.
- Keep non-modal behavior so the grid stays interactive for drag-and-drop while the drawer is open.
- Drawer height remains approximately `50dvh`, full width, bottom-anchored.
- Grid region becomes full-bleed (drop `lg:ml-[50%]` / half-width desktop split).
- Toolbar always exposes **Bricks** (stop hiding it on desktop).

## Filmstrip content (`GroupsPage` / `/` only)

- Render groups in a horizontal row: `flex` + `overflow-x-auto` + `overscroll-x-contain`.
- One column per group: group title link, catalog outline, and current preview (same pieces as today).
- Each column may scroll vertically if content exceeds the drawer body; columns use a preview-driven min-width so previews are not crushed.
- Keep `data-vaul-no-drag` on the scroll body so horizontal scroll and brick drag do not fight the sheet gesture.
- Nested routes under `/groups/...` continue to render in the same drawer `Outlet` as a normal full-width panel; they are not part of the filmstrip.

## Drawer chrome

- Replace the mobile drag-handle-only strip with a studio-like header: **Bricks** title (optional short subtitle), close button on the right.
- Preserve accessibility: dialog named **Bricks**; close control labeled **Close drawer**.

## Tests / docs impact

- Update Playwright coverage that asserts the desktop left **Bricks panel**, half-width grid, desktop-only absence of the **Bricks** toolbar button, and any layout assumptions tied to the split.
- Keep coverage for: open from toolbar, close from header, non-modal drag onto grid, navigate a group link inside the drawer.
- Add or adjust an assertion that the groups list scrolls horizontally (or that group columns are laid out in a row) when the drawer is open on `/`.
- If `docs/styleguide/component-and-file-naming.md` or bricks sandbox docs describe the left half-panel, update those references in the same implementation pass.

## Approach

CSS filmstrip inside the existing Vaul drawer (no Embla for groups). Smallest change that meets the UX; avoids DnD vs carousel conflicts.
