# Plan 078 — Wall selection

1. Split the Row and Stack tags into a name button and a chevron menu. A name click selects the container and shows the persistent blue outline.
2. Use `selected` in the Page search for a Row, Stack, or inline Brick ID. The existing Brick detail path takes precedence. Match IDs against the active Wall. For example, `?breakpoint=lg&selected=row_…` outlines the Row, and `?breakpoint=lg&selected=brk_…` selects an Article in place.
3. Select Articles on an ordinary editor click while preserving native editing. A blank click outside the selection clears it. Menus, resize handles, and blank clicks inside the selection preserve it.
4. Run App and Storybook builds and the Sticky Actions and Stack Insertion stories. Verify pointer and keyboard activation, selection transitions, Article caret and autosave, URL refresh and history, and missing IDs at different breakpoints.
5. Reconcile the glossary and [Plan 062](../../plans/062-plan-brick-owned-interactions.md) with the implemented behavior and archive this plan after verification.

## Files

`+` means create. `~` means modify.

```text
qrk.sh/
├── apps/app/
│   ├── app/[username]/site/[siteId]/
│   │   ├── Toolbars/~ SiteToolbar.tsx
│   │   └── page/[pageId]/
│   │       ├── ~ PagePreview.tsx
│   │       ├── ~ layout.tsx
│   │       └── (sidebar)/~ layout.tsx
│   ├── components/WallEditor/
│   │   ├── ~ WallEditor.tsx
│   │   └── ~ WallEditor.stories.tsx
│   ├── modules/~ bricks.css
│   └── routes/~ $username.site.$siteId.page.$pageId.tsx
├── ~ AGENTS.md
└── wiki/
    ├── ~ glossary.md
    ├── ~ brick-layout-conventions.md
    └── plans/
        ├── ~ 062-plan-brick-owned-interactions.md
        └── + 078-plan-wall-selection.md
```

## Implementation and verification status

1. Implemented on `main`. The App typecheck, App build, App Storybook build, and `git diff --check` passed.
2. Both Sticky Actions stories and Stack Insertion With Gaps passed in headless Chromium. A focused check verified keyboard Stack and Row selection, outline persistence after blur, the Row alignment chevron preserving selection, and an Article click moving selection and focus into the inline editor.
3. Stack Insertion reproduced the [known section overflow in Plan 074](../../plans/074-plan-app-wall-shadcn-overlays.md#implementation-status) with a 362px scroll width and a 361px limit.

4. A smoke check using the actual Page search validator and installed TanStack Router passed copied-URL parsing and same-page selection URL construction, including keeping the Page settings path and clearing only `selected`.

5. Signed-in Chrome verification passed using the existing Article autosave and Wall cutover fixtures. Name clicks and keyboard activation updated the URL and drew a persistent blue outline. Stack and Row menus and a resize control preserved selection. Blank space inside a selected Row preserved it, while blank clicks outside the Row and in the editor header cleared it.
6. Article title clicks selected the Brick and retained the caret while typing. The edit survived reload after autosave settled. The original fixture title was restored and checked after reopening. Copied URLs, reload, Back and Forward, settings sidebar navigation, and breakpoint scoping restored the expected selection. A Row ID from another breakpoint drew no outline. The Brick details path took precedence over a simultaneous selection query, and selecting a Row or Stack closed the Brick panel.
7. Updated the glossary, Wall conventions, and Plan 062 to reflect the verified behavior.

## Remaining work

None.
