# 057 · Remove both `modules/lib` directories

## Scope and ownership

Move files and update their imports and live documentation links. Preserve editor behavior, story IDs, API and schema shapes, and System registrations.

1. Move the Wall Editor, its helpers, styles, and stories into the existing `components/WallEditor/` folder. Keep session wiring in the Page route. Put the shared preview frame components under `components/PagePreview/` and colocate the Drawer and its story under `components/Drawer/`.
2. Move the preview toolbar and its story to the Site toolbar, the module picker components to the Page route’s `Modules/` folder, and App preview breakpoint settings to `lib/breakpoints.ts`. Zerospin’s `wallSizing.ts` still defines the authored Wall widths.
3. Place the playground and its preview rows under `.storybook/ModulePlayground/`. Keep module stories beside their modules. Scan the playground files for Tailwind utilities through Storybook’s preview stylesheet. Place shared module types, registry, and JSON Render infrastructure under `modules/`.
4. Move Placement identity and row sharing helpers into the User Aggregate’s browser-safe `layout/` folder. Update App, command, and test imports.
5. Repair live source links, including the [Wall-owned layout ADR](../../adrs/001-wall-owned-layout-tree.md). Reconcile the existing glossary after verification. This move introduces no domain terminology or new architectural decision.

`+` adds a path, `~` updates an existing path, and `−` removes a path. The tree groups import-only edits by owner.

```text
qrk.sh/
├── apps/app/
│   ├── .storybook/
│   │   ├── + ModulePlayground/{ModulePlayground,BreakpointPreviewRow}.tsx
│   │   ├── + preview.css
│   │   └── ~ preview.ts
│   ├── app/[username]/site/[siteId]/
│   │   ├── + Toolbars/WallPreviewToolbar{,.stories}.tsx
│   │   └── + page/[pageId]/Modules/{ModuleFilmstrip,ModulePreview}.tsx
│   ├── components/
│   │   ├── + Drawer/Drawer{,.stories}.tsx
│   │   ├── + PagePreview/{BrowserChrome,PreviewSection}.tsx
│   │   └── ~ WallEditor/                         # Editor, helpers, CSS, and stories
│   ├── + lib/breakpoints.ts
│   └── modules/
│       ├── + {modulesHash,types}.ts
│       ├── + jsonRender/layoutRegistryComponents.tsx
│       └── − lib/
├── apps/zerospin/
│   ├── src/aggregates/user/
│   │   ├── + layout/{canShareRow,makePlacementId}.ts
│   │   └── ~ contracts/                          # Defining-file imports
│   ├── src/modules/
│   │   ├── + jsonRender/layoutComponentMetadata.ts
│   │   └── − lib/
│   └── ~ test/                                   # Defining-file imports
└── wiki/
    ├── + plans/057-plan-remove-modules-lib.md
    └── ~ adrs/, research/, and archive/           # Live source links
```

For example, the command imports the same row compatibility rule the editor uses for its drop preview.

```ts
// In AddBrickContractV5.ts, use the User Aggregate's browser-safe layout rule.
import { canShareRow } from "../../layout/canShareRow";
```

## Verification

1. Run the App build, Storybook build, and Zerospin tests through Nx. Use the existing Wall fit and Placement move tests to verify the shared layout rules.
2. Compare the Storybook index before and after the move, including scripted Wall stories, Drawer and toolbar stories, and module playground stories.
3. Check that both old directories are gone, live references resolve, and the code diff only relocates files and updates import paths.

## Outcome

1. Removed both directories and verified that live references use the new locations.
2. The App build passed with local loopback access for TanStack prerendering. The Storybook build passed, and its 61 entry IDs and metadata match an index regenerated from the pre-change source. The generated Storybook stylesheet includes the playground’s Tailwind utilities.
3. All 21 Zerospin tests passed across 5 files. The glossary still describes the implemented behavior.

## Remaining work

None.
