# 022 — Replace Article Tiptap with Meowdown

## Agreed behavior

1. Replace Article editing and display in Library and Studio using installed Meowdown React `0.71.4` and core `0.72.1`.
2. Store `content` as `string | null`; keep title and subtitle separate and required. Null displays as an empty body. Retain current V1 naming for the approved hard cutover.
3. Use native controls and Hybrid mode (`focus`), without a toolbar or mode switcher. Retain native image resizing.
4. Keep uploads and automatic social/video embeds disabled. Explicitly authored media syntax may show native placeholders; add no custom embed handling.
5. Preserve typography, equal nested-list spacing, draft isolation, Save/Cancel, failure recovery, and saved brick dimensions.
6. Use the approved clean local cutover. JSON conversion, compatibility readers, and custom rich formatting are excluded. Markdown round trips may normalize source.

## Implementation

1. Preserve existing spike/form work and unrelated WIP. Use `implement`, repository patterns, and the installed declaration-evolution guidance.
2. Stop affected processes and close browser tabs/workers before rebuilding. Move backend storage to a timestamped backup. Preserve existing browser-origin databases and Clerk cookies; use fresh local origins for rebuilt apps.
3. Change both Article state and generated-component props to nullable text. Convert the default example to equivalent Markdown; retain `/title`, `/subtitle`, and `/content` bindings.

   ```ts
   // 1. The body is Markdown; null retains the existing empty-state meaning.
   content: primitives.text({ nullable: true, defaultValue: null }),
   ```

4. Replace ArticleEditorControl internals with client-mounted MeowdownEditor. Initialize once, emit getMarkdown into the draft, ignore content echoes, and silently apply genuinely different external content. Preserve Cancel remounting and history isolation between bricks.
5. Retain whole-state validation and submission guards. Ignore submits bubbling from Meowdown's portaled link form.

   ```tsx
   // 1. Link-popup submissions must not save the enclosing Article.
   if (event.target !== event.currentTarget) return;
   event.preventDefault();
   ```

6. Replace Tiptap HTML generation with client-mounted MarkdownView in Hide mode. Preserve new-tab links and disable task checkboxes after rendering; mount no editor in previews.
7. Set embedPaste=false and stable X/YouTube resolvers returning undefined on editor and viewer. Omit onFilePaste.
8. Reuse Article styles and the public article-editor.css export. Import Meowdown CSS, promote both spike list fixes, preserve typography, and elevate native popups above drawers. Retain deferred Escape handling without obsolete Tiptap selectors.
9. Remove the toolbar, Tiptap implementation tree, document-schema export/build entry, Tiptap dependencies, resize extension, and obsolete placeholder CSS. Promote pinned Meowdown packages to runtime dependencies. Bundle Meowdown with React external.

## Planned files

`+` create, `~` modify, `-` remove.

```text
/Users/morgs32/GitHub/qrk.sh/
├── ~ pnpm-lock.yaml
├── apps/library/
│   ├── ~ README.md
│   ├── ~ package.json
│   ├── ~ vite.lib.config.ts
│   ├── ~ app/LibraryLayout.tsx
│   ├── - lib/TiptapDocSchema.ts
│   └── modules/article/
│       ├── ~ article.ts
│       ├── ~ articleV1.ts
│       ├── ~ ArticleForm.tsx
│       ├── ~ ArticleEditorControl.tsx
│       ├── ~ ArticleBrickContent.tsx
│       ├── ~ article-editor.scss
│       ├── ~ MeowdownSpike.stories.tsx
│       ├── ~ generator/ArticleBrickComponent.ts
│       ├── - ArticleToolbar.tsx
│       ├── - MeowdownSpike.css
│       └── - tiptap/
├── apps/studio/
│   ├── ~ README.md
│   └── ~ app/globals.css
├── apps/zerospin/~ README.md
├── ~ TODOS.md
└── wiki/
    ├── + glossary.md
    └── plans/+ 022-plan-article-meowdown.md
```

## Verification and completion

1. Run scoped Library/Studio/backend typechecking and lint, Library build, existing backend Workerd checks, and changed-file formatting checks through Nx. Create or run no Library tests; leave stale inline-editor suites outside scope.
2. Manually verify Storybook and both apps: supported formatting, nested lists, native menus, block dragging, image resizing, undo/redo, null/empty bodies, Save/reload, Cancel, failed-Save retention, and breakpoint changes. The Article story uses the production ArticleForm as its manual Save/Cancel/failure seam; no Library tests are added.
3. Confirm link-popup Save does not submit Article; Escape dismisses native controls before the drawer; committed previews stay unchanged during drafting. Check hydration, narrow layouts, clickable links, disabled tasks, and fixed brick sizes.
4. Require backend system spec accepted. Confirm persisted bodies are Markdown and URL pastes trigger no automatic media-provider requests.
5. Update affected documentation and reconcile terminology after implementation. Glossary creation was explicitly authorized after implementation; record implemented Article terminology in `wiki/glossary.md`. Create an ADR only for an implemented decision that is hard to reverse, surprising without context, and the result of a real trade-off.
6. Archive this plan only when required implementation, verification, and documentation are complete.

## Implementation record

1. Backend storage preserved at `apps/zerospin/.wrangler/zerospin/backups/sys_qrk_sh_1-20261014T154556Z-pre-meowdown`. Existing Library and Studio browser tabs closed; their origin databases and login state remain untouched.
2. Contract, editor, viewer, shared styles, Markdown default fixture, and Tiptap dependency/export removal are implemented. The Article story now exercises the production form with successful and simulated failed saves. Library/Studio/backend dependencies now use Zerospin `11.0.0` from the concurrent session migration, which was preserved.
3. Library, Studio, and backend typechecking and lint pass; Library build passes. The existing backend Workerd suite passes all 13 checks. Library typechecking and lint were repeated successfully after the final bundle correction. All 18 affected source and documentation files pass the scoped formatting check; scoped whitespace checks pass.
4. Storybook manual checks pass for successful Save, failed Save with retained draft, Cancel, and a late failure after Cancel. Library manual checks pass for Save/reload; native link-popup submission isolation; content echoes; Cancel and undo isolation; retained dirty title across breakpoint changes; committed read-only wall content; disabled saved tasks; headings, tables, and equally spaced nested lists; HTTP image rendering and native resize to 480 px with its Markdown comment retained after reload; null and empty bodies; native slash-menu Escape; heading creation; native block movement with undo/redo; and YouTube/X URL paste without media-provider requests.
5. At a 390 px viewport, the Article body wraps without drawer overflow; the viewport was restored afterward. The existing header overlap is outside this change.
6. The fresh authenticated Studio origin at `http://localhost:3001` passes Article placement, draft isolation, Save/reload, Cancel, dirty-title retention across breakpoint changes, and a 390 px drawer without horizontal overflow. The saved wall mounts no editable nodes and retains its 720 px / four-row placement. Its Meowdown dependency exposed a CommonJS React require in the Library bundle; the existing Rolldown `esmExternalRequirePlugin` now owns React externalization and converts those requires to ESM. The corrected build contains no runtime React requires, and the consumer browser flow passes.
7. For the explicitly authorized fresh-origin Studio check, backend authentication temporarily accepted port 3001. The port 3000 setting was restored afterward, and the restarted backend accepted its system spec. The temporary setting is not part of the implementation.
8. Affected documentation is updated. The user authorized the glossary, and `wiki/glossary.md` now records Article, Article body, Article draft, and Committed Article according to implemented behavior. No ADR is warranted for this reversible editor replacement.

9. A committed Article link opened `https://example.com/` in a new tab. The temporary tab was closed. The verified Library editor screenshot is saved at `/Users/morgs32/.codex/visualizations/2026/10/14/meowdown-replacement/article-meowdown.jpg`.

## Remaining work

None.
