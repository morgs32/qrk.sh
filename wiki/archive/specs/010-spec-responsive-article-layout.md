# Responsive article layout design

**Date:** 2026-09-29

**Status:** Converted to implementation plan

## Problem Statement

Studio always displays an article beside the wall. Page Settings cannot hide the article or choose its position at each page breakpoint. The existing breakpoint toolbar changes the wall's preview width inside its column; it does not resize the complete article and wall composition. This makes the preview misleading: a selected breakpoint can differ from the width available to the wall, while the surrounding page layout remains unchanged.

## Solution

Page Settings gains a page-wide **Show article** control and an **Article position** control for the selected page breakpoint. The toolbar selects the width of the whole page preview. Article placement follows that page breakpoint. The wall independently resolves its brick layout, and brick catalog previews, from the wall's measured available width.

The settings live on the existing page. Draft changes affect the preview immediately and join the current Page Settings Save/Cancel behavior. Article content and saved position choices survive hiding the article.

## User Stories

1. As a page author, I can turn the article off and use the full composition width for the wall.
2. I can turn the article back on without losing its document or saved position choices.
3. I can switch page breakpoints without closing Page Settings or losing unsaved settings.
4. At md, lg, and xl, I can independently choose **Top** or **Left** for the article.
5. At sm, I see the article above the wall whenever it is visible; I cannot choose Left there.
6. I can see unsaved changes in the page immediately, save them with the other page settings, or cancel them.
7. I see brick layouts and brick previews appropriate to the wall's actual width, even when the page preview is wider.
8. When the article is off, Compose is unavailable until I re-enable the article.

## Current Source Context

1. `MainColumns.tsx` renders two equal columns for both existing `pageType` values. `split-scroll` scrolls the columns independently; `shared-scroll` uses one shared scroll region.
2. `Grid.tsx` currently gives the wall a fixed width matching the toolbar selection on bricks and `/breakpoints` routes. `WallViewportProvider` measures the grid region and supplies the selected breakpoint to the toolbar and brick drawer previews.
3. `PageSettings.tsx` drafts title and description through `pageStore.ts`, compares them with a page baseline, stages `updatePageSettings`, and provides Save or Cancel. The current command updates only title and description.
4. The page model stores `pageType` and `article`. `createPage` creates the page, and `updatePageArticle` saves the article independently. Compose is an active route, despite the older `004-plan-remove-compose.md` document.

These are source observations for planning; they are not a request to refactor the existing ownership or scrolling code beyond this feature.

## Design Decisions

### 1. Page width and wall width are separate inputs

The toolbar's sm/md/lg/xl controls select whole-page preview widths of 360, 720, 1080, and 1440px. The selected page breakpoint determines article placement. The wall receives the width left by that composition and selects its brick layout by its own measured width, using the existing wall breakpoint thresholds. Brick catalog and detail previews use that wall breakpoint too, so their dimensions agree with the wall to which a brick will be added.

| Page preview | Article placement | Article width | Wall width | Wall brick breakpoint |
| ------------ | ----------------- | ------------: | ---------: | --------------------- |
| sm, 360px    | Top, fixed        |         360px |      360px | sm                    |
| md, 720px    | Left              |         360px |      360px | sm                    |
| md, 720px    | Top               |         720px |      720px | md                    |
| lg, 1080px   | Left              |         540px |      540px | sm                    |
| xl, 1440px   | Left              |         720px |      720px | md                    |

These widths describe the composition before any existing internal spacing. The wall breakpoint is resolved from the measured usable wall width, rather than from the table or toolbar label alone. With the article off, the wall occupies the full selected page width and resolves its layout from that width.

Annotated example:

```text
Selected page preview: md, 720px    # The toolbar sizes the entire composition.
Saved/draft md position: Left        # This choice belongs to the page breakpoint.

┌────────────── 720px ──────────────┐
│ Article: 360px │ Wall: 360px       │
└────────────────┴───────────────────┘
                   ↑ The wall chooses sm brick geometry from its measured width.

Change md position to Top:         # The page breakpoint remains md.
┌────────────── 720px ──────────────┐
│ Article: 720px                    │
│ Wall:    720px                    │ ← The wall now chooses md brick geometry.
└────────────────────────────────────┘
```

### 2. Visibility is page-wide and independent of article content

**Show article** applies at every breakpoint. Off removes the article from the displayed composition and gives the wall the complete page width. It does not delete, replace, or reset `page.article`, and it does not clear md/lg/xl position choices. Restoring visibility uses the retained article document and the position chosen for the current page breakpoint. Hiding the article is a page setting change; it is not an article autosave operation.

### 3. Position is independent at md, lg, and xl

Page Settings shows one Top/Left choice for the currently selected page breakpoint. Changing the toolbar selection changes which stored draft choice is being edited; it does not copy a value to another breakpoint. At sm, show **Top** as fixed with a brief explanation that small pages always place the article above the wall. There is no sm override to save. When **Show article** is off, hide the position control; keep all choices in the draft and persisted page.

The default for existing and new pages is visible article, sm Top, and md/lg/xl Left.

### 4. Preserve the existing scrolling preference

Left uses the existing equal-width columns. For `split-scroll`, article and wall retain their separate vertical scroll regions. For `shared-scroll`, they retain their shared vertical scroll region. Top places the article before the wall in one vertical scrolling flow, including when `pageType` is `split-scroll`. Article-off has one wall region. Changing position or visibility does not alter the saved `pageType` value or introduce a new scrolling preference.

### 5. Preview ownership and navigation

The page preview selection belongs to the mounted Studio editor session. Page Settings, bricks routes, and `/breakpoints` all use it to size the whole composition. Page Settings must remain open while the author switches widths. Navigation among these preview routes retains the selection and the Page Settings draft. On routes without an active preview, the composition uses its actual available width to resolve the page breakpoint and article placement; a retained selection does not force a fixed width there. Returning to a preview route can reuse that selection, subject to the available width.

Preview controls are centered over the complete composition. With Page Settings or a bricks drawer open, the breakpoint-only toolbar sits 1.5rem above the drawer. Retain sm/md/lg/xl labels, selected state, width tooltips, and disabling of widths that cannot fit the available composition. If a retained choice cannot fit after a resize, use the largest width that can fit for the active preview without erasing the retained choice. Below the 360px minimum, show the existing insufficient-width state adapted to the whole composition. The dedicated `/breakpoints` route keeps its close action.

The wall and its session stay mounted while widths or positions change. Preview changes may resize the wall and select different brick geometry, but must not recreate its session or discard in-progress editing state. Hiding and restoring the article must not overwrite its retained document or change article autosave semantics.

### 6. Persist one page-owned settings value

Extend the page model, the existing `updatePageSettings` command boundary, and the existing page draft with these conceptual fields:

```ts
{
  articleVisible: true, // One page-wide value; article content remains separate.
  articlePosition: {
    md: "left",          // Each choice is independent and is either "top" or "left".
    lg: "left",
    xl: "left",
    // sm is always "top" and has no persisted override.
  },
}
```

The stored position values are restricted to `"top"` and `"left"`; no extra breakpoint keys or placement values are accepted at the command boundary. Keep the current authentication, page ownership, and validation boundary on `updatePageSettings`. Do not create a layout resource, duplicate persisted settings, or move article content into settings. The exact model and contract versioning is an implementation-planning choice, subject to the compatibility requirements below.

Historical pages must read with the defaults above while retaining their article and other page fields. Historical `createPage` commands must create a page with those defaults. Historical title/description-only `updatePageSettings` commands must leave existing article settings alone rather than resetting them. New page creation and updates must make the current intended values durable through reload and replay. No migration may discard article content.

### 7. Extend Save/Cancel as one Page Settings draft

Visibility and all three position choices join title and description in the existing page draft, baseline comparison, Save, and Cancel behavior. Any changed field makes Page Settings dirty. The preview reflects draft visibility and position before Save. Switching preview breakpoints changes no saved page setting, preserves choices already made at other breakpoints, and does not itself make Page Settings dirty.

Save stages the complete intended settings change through the existing page settings command. A successful Save updates the comparison baseline; a failed Save keeps the dirty draft visible for correction or retry. Cancel discards unsaved title, description, visibility, and position changes together and restores the saved composition. Closing a clean drawer has no settings effect. The article document is outside this settings draft and follows its existing autosave behavior.

### 8. Compose follows effective article visibility

When the article is off in the effective page preview, the base toolbar does not offer Compose. Direct navigation to `/compose` returns to the base page route without enabling the article, changing its content, or starting article editing. If a draft visibility change hides the article while Page Settings is open, Compose is unavailable in that preview immediately. Re-enabling the article restores the normal Compose affordance. Existing Compose editing and autosave behavior otherwise stay as they are.

## Acceptance and Verification

1. Use existing authenticated Studio browser checks to cover Page Settings visibility, independent md/lg/xl choices, fixed sm Top, dirty state, live preview, Save, Cancel, and persisted reload. The controls must remain usable while switching preview widths with the settings drawer open.
2. Check both annotated 720px cases. Assert the wall uses sm brick geometry at md/Left and md brick geometry at md/Top; checking only the selected toolbar label is insufficient. Check a wider Left case and article-off full-width behavior as well.
3. Check the toolbar on Page Settings, every bricks route, and `/breakpoints`: centered over the whole composition, 1.5rem above an open drawer, retained selection, appropriate selected and disabled states, width tooltips, and the `/breakpoints` close action. Check narrow available widths and reduced-motion behavior.
4. Check that changing width, position, and visibility retains the mounted wall identity and session. Hiding and restoring the article preserves its document and stored positions. Confirm Compose is hidden while the article is off and direct `/compose` navigation returns to the base page without a write.
5. Extend existing backend command checks for defaults on new and historical pages, replay of historical creation and title/description updates, successful persistence, invalid position rejection, and current ownership enforcement.
6. Run affected typechecking and lint. Add or run no `@qrk.sh/library` / `apps/library` tests; verify any shared Library behavior through permitted static and manual checks.

## Out of Scope

1. Adjustable column ratios, article-right, article-bottom, and breakpoint-specific article visibility.
2. New article editing features, article autosave changes, and deletion of article content.
3. New scrolling preferences, brick placement algorithm changes, and standalone Library redesign.
4. Unrelated draft-store consolidation or fixes to concurrent work in progress.

## Further Notes

1. Current source is authoritative: Compose exists despite the older removal plan.
2. This design was converted to [plan 010](../plans/010-plan-responsive-article-layout.md), which was later superseded and archived; no issue was created.
