# Article list spacing and CSS layer order

Status: Complete and archived on 2026-10-19. CSS verification and both production build targets passed.

## What is happening

The numbered markers and the article text occupy the same horizontal space.
Meowdown positions its markers absolutely and reserves a gutter using
`margin-inline-start: 1lh` on each `.list-content`. Tailwind Preflight resets
element margins to zero. The browser currently gives that reset higher priority.

This is a cascade-layer ordering problem. CSS compares layer priority before
selector specificity. Meowdown's more specific selector cannot beat a normal
declaration in a higher-priority layer.

```css
/* 1. Meowdown's intended gutter: one rendered line-height. */
@layer meowdown.base {
  .prosemirror-flat-list > .list-content {
    margin-inline-start: 1lh;
  }
}

/* 2. A later, higher-priority base layer resets that gutter too. */
@layer base {
  * {
    margin: 0;
  }
}
```

The desired top-level order, from lower to higher normal priority, is:

```css
/* 1. Reset first; editor defaults later; utilities retain the last named layer. */
@layer theme, base, components, meowdown, utilities;
```

## Evidence

1. Before the draft fix, the live article's marker and text both started at
   x=225px. The marker occupied about 30.4px; `.list-content` had a computed
   start margin of 0px. All four numbered rows overlapped.
2. The installed `@meowdown/core/dist/style.css` supplies the intended `1lh`
   gutter in `meowdown.base`, and absolutely positions the marker at the start
   of the row.
3. The former Article SCSS declared the desired layer order before its two
   Meowdown CSS imports. The [current CSS source](../../../apps/library/modules/article/article-editor.css)
   preserves that order without Sass processing.
4. Current Studio development output reverses that relationship:
   `apps/studio/.next/dev/static/css/app/layout.css` first declares
   `meowdown.base` around line 5, supplies the gutter around line 67, and only
   declares the intended top-level order around line 2187. Tailwind's `base`
   reset appears later, around line 2464. Generated paths and lines are
   diagnostic evidence, not files to edit.
5. An in-memory compilation with the installed Sass version confirmed that Sass
   hoists these CSS imports ahead of the layer statement. Adding
   `layer(meowdown)` to an import also gets hoisted and would additionally nest
   the package's existing layer names.
6. Layers take their order from their first declaration. The later statement
   cannot move the already established `meowdown` layer after `base`.
7. In-memory processing of the equivalent plain CSS with both installed
   Tailwind PostCSS versions preserved the intended order statement before
   `meowdown.base`, without warnings. This supports the proposed conversion;
   full app output and visual verification remain pending.

References: [CSS cascade ordering](https://www.w3.org/TR/css-cascade-5/#cascade-sort),
[layer ordering](https://www.w3.org/TR/css-cascade-5/#layer-order), and
[Tailwind Preflight margin reset](https://tailwindcss.com/docs/preflight).

## Recommended change

Preserve the existing layer contract in ordinary CSS, outside Sass's import
hoisting. Keep the fix in Article's stylesheet and the two consuming apps'
existing CSS entrypoints.

1. Convert `apps/library/modules/article/article-editor.scss` to
   `article-editor.css`. The file uses ordinary CSS declarations and nesting;
   retain those rules and convert its single `//` comment to a CSS comment.
   Preserve the layer-order statement before both Meowdown imports.
2. Keep the public `@qrk.sh/library/article-editor.css` import name unchanged.
   In `apps/library/package.json`, point that export to the renamed file.
   Update the four direct imports in `ArticleBrickContent.tsx`,
   `ArticleEditorControl.tsx`, `ArticleRendererComparison.stories.tsx`, and
   `MeowdownSpike.stories.tsx` in the same Article directory.
3. Declare the same complete layer order at the start of
   `apps/studio/app/globals.css` and `apps/library/app/globals.css`, before
   their imports. Either app globals or Article CSS may load first; each
   should establish the same order. Library Storybook already imports
   Library's globals and needs no separate configuration.
4. Remove the unverified four-line `.list-content` override added immediately
   before planning. It duplicates the package rule outside any layer and
   bypasses the ordering defect. Restore the native Meowdown rule as the
   source of the gutter.
5. Update Library and Studio README references to the SCSS source and describe
   the actual layer contract.
   Preserve the pre-existing hover-border edits in that README and
   `bricks.css`. The draft README gutter sentence may be revised as part of
   this documentation update.

Proposed Article entrypoint:

```css
/* 1. Establish priority before any imported stylesheet declares a layer. */
@layer theme, base, components, meowdown, utilities;

/* 2. Keep Meowdown's existing nested layers and native list spacing. */
@import "@meowdown/core/style.css";
@import "@meowdown/react/style.css";

/* 3. Retain the existing Article typography and layout rules below. */
.qrk-article-editor {
  /* Existing declarations stay here; no duplicate list gutter is required. */
}
```

The public import remains stable:

```jsonc
{
  "exports": {
    // Only the source file extension changes; consumers keep their import.
    "./article-editor.css": "./modules/article/article-editor.css"
  }
}
```

## Verification after approval

1. Inspect emitted Studio and Library CSS: the first layer declaration must
   establish `base` before `meowdown`. Confirm native CSS imports and nesting
   compile correctly in each app's existing pipeline.
2. On the reported article, confirm all four `.list-content` elements compute
   `margin-inline-start: 1lh` (about 30.4px at the current typography) from
   Meowdown's rule. Confirm markers do not overlap text and wrapped lines
   align with the first text line.
3. Check ordered, bulleted, nested, and task lists using the existing Article
   comparison/spike fixtures and editor. Do not save changes to the user's
   article just to verify spacing. Check a narrow viewport as well.
4. Visually check headings, paragraphs, and blockquotes: restoring the layer
   order can restore other Meowdown defaults that Preflight currently masks.
   Preserve intentional Article typography overrides.
5. Inspect production output through the existing relevant app build targets
   to confirm CSS processing preserves the same order. Add no test suite or
   standalone check gate.
6. Capture the corrected article screenshot and update this plan with observed
   results before marking it complete.

## Implementation and verification results

1. Renamed the stylesheet to ordinary CSS, updated its public export and all
   four direct imports, and removed the draft gutter override. The existing
   style rules are retained; only the Sass comment syntax changed.
2. Studio and Library globals declare the complete layer order before imports.
   Both development CSS outputs establish `base` before `meowdown` and retain
   the package's native list gutter.
3. The authenticated reported Studio article rendered all four numbered rows
   with a computed 30.3906px gutter. Each text box starts at the marker box's
   right edge. Wrapped lines align with the first text line; no overlap was
   observed. The article data was not edited or saved.
4. The existing Meowdown spike editor fixture passed ordered, bulleted, nested,
   and task list checks at the normal viewport and at 390px wide. All seven
   list rows retained the native 30.3906px gutter. Headings, paragraph spacing,
   quote borders, code, and tables were visually checked. The temporary
   viewport override was reset.
5. `pnpm nx run @qrk.sh/library:build-storybook` passed. Library has no app
   `build` target, so its existing Storybook build supplied the production CSS
   check. Both its Article asset and global asset preserve the layer contract.
6. `pnpm nx run @qrk.sh/studio:build` passed, including TypeScript and production
   page generation. Its Article CSS starts with the complete layer order and
   retains the native gutter. The user explicitly approved the adjacent
   two-line Grid repair: `rememberScroll` is now a const arrow function so
   TypeScript retains the existing `scroll` null check. Its body and call sites
   are unchanged. This resolved the four pre-existing TS18049 build errors.
7. Source review found no remaining application references to the former SCSS
   path and no in-scope implementation findings. `git diff --check` passed.
   Pre-existing hover-border work in `bricks.css` and Library README is retained.
8. Screenshot evidence: [corrected live article](/Users/morgs32/.codex/visualizations/2026/10/19/01a1546a-710a-7083-b560-bfa1d2ce1785/plan-028-article.jpg)
   and [390px editor fixture](/Users/morgs32/.codex/visualizations/2026/10/19/01a1546a-710a-7083-b560-bfa1d2ce1785/plan-028-fixture-narrow.jpg).
9. Archived this plan with its source link repaired for the new directory.
   No inbound repository links required updates.

## Remaining work

None.
