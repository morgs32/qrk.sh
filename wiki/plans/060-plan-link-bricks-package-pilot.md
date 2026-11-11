# 060 · Pilot the Bricks workspace package with Link

1. Create one private, source-consumed `@qrk.sh/bricks` package. Move Link's definition, React registry and components, form and stories, plus their shared dependencies. Rewire the other Bricks to the same defining files.
2. Keep `linkV1` and saved specs compatible. Keep the existing System registration and provider execution in their owners. App binds the lookup callback at its Link registration and Web's WallViewer fixture renders a saved Link spec.
3. Put the reusable `BrickStory` component and Storybook configuration in Bricks. Share one example state and active spec across the four breakpoint comparisons. Put Configure and Generate Spec in a right-side shadcn Sidebar. Keep live RPC through the Storybook proxy and keep the two Link story IDs.
4. Add the scoped import check and wire it into the consuming targets. Verify approved exports and deliberately forbidden edges.

```ts
// Definition for generation and command code, React registry for display.
import { linkV1 } from "@qrk.sh/bricks/modules/link/definition";
import { linkReactRegistry } from "@qrk.sh/bricks/modules/link/react";
```

```tsx
// App supplies its transport at the existing Link registration.
<LinkForm
  state={state}
  onSave={onSave}
  onCancel={onCancel}
  lookupLinkPreview={lookupLinkPreview}
/>
```

`+` adds or relocates files. `~` updates existing files.

```text
qrk.sh/
├── + apps/bricks/
│   ├── src/link/
│   ├── src/definition/, src/react/, src/rpc/
│   ├── .storybook/
│   ├── scripts/check-imports.mjs
│   ├── package.json
│   └── tsconfig.json
├── ~ apps/app/
├── ~ apps/web/
├── ~ apps/api/
├── ~ apps/zerospin/
└── ~ pnpm-lock.yaml
```

## Verification

1. Run the import check against the workspace and deliberate negative fixtures. Run App, Web, API, Zerospin, and Storybook checks through Nx.
2. Verify Link's saved and default specs, placeholder, lookup and generation, draft retention, and right sidebar. The user owns manual browser verification under the dated choice in AGENTS.md.
3. Reconcile the module documentation and glossary. Evaluate ADR criteria after implementation. [Wall-owned layout](../adrs/001-wall-owned-layout-tree.md)

## Verification results

1. App and Web production builds, API's Wrangler dry run, the three Storybook
   builds, and all 21 Zerospin tests passed through Nx. Web's build passed after
   setting aside its stale Turbopack production cache. Bricks and Web passed
   standalone TypeScript checks. App's separate type check still reports the
   existing `Menu.Trigger` ref mismatch in `WallPlacement.tsx`.
2. The import check passed against the workspace and rejected direct React,
   transitive React, Bricks-to-App, and relative and aliased export bypasses.
3. Automated browser checks covered all ten Brick stories, Link's placeholders
   and saved specs in App and Web, four-width form saves, the right sidebar,
   retained drafts, and mocked lookup and generation success, failure,
   cancellation, and reset. The Mapbox worker error also reproduced in a
   pre-pilot build.
4. Updated the module and layout conventions and repaired live source links.
   Existing glossary definitions still describe the domain.

## Follow-up

Moved the other nine Bricks and the worker-safe catalog into the same package
at `apps/bricks`. The hosts retain their existing session, provider, and
persistence responsibilities. The import check now scans every Brick definition
and treats the Bricks app as the package owner.

App and Web production builds, the API dry run, all three Storybook builds,
Bricks TypeScript, and all 21 Zerospin tests passed again. App Storybook kept its
60 existing IDs. The dedicated Storybook returned all 25 expected entries through
[bricks.qrk.localhost](https://bricks.qrk.localhost/).

## Remaining work

1. The user owns the manual browser pass. Archive this plan after that pass.
