# 052 — Keep module preview state out of backend startup

**Status:** Planned; implementation has not started.  
**Baseline:** [PR #58](https://github.com/morgs32/qrk.sh/pull/58), which separates catalog construction and establishes `componentMetadata` / `propsShape` naming. Implement on that change or its merged successor, excluding unrelated Stack-fit work.

## Problem

1. `backendLibrary.ts` imports all ten native module versions. Those files also contain example data and supply `defaultState` to `makeModuleVersion`.
2. Importing GitHub Activity therefore generates 365 dated contribution samples. The native factory also decodes each module's example and derives `def`, although backend commands use the module's state shape, component metadata, sizing, and initial spec instead.
3. App needs these examples for previews, the module playground, form initialization, and creation input. Some Storybook fixtures and backend tests also read examples directly from native module definitions.
4. Removing the constructor's decoder alone would leave the top-level sample generation in the backend import graph. The sample declarations and their imports must move together.

## Agreed ownership and behavior

1. Each module owns a separate plain TypeScript `<module>PreviewState.ts` file beside its native version definition. Export one `<module>PreviewState` value containing its current example state. Move the existing example declarations, including the GitHub date/count generator, without changing their content or generation rules.
2. App's corresponding module view explicitly imports that example and supplies a required `defaultState` input to `makeModuleView`. Relevant stories, preview animation, and tests may import the same plain data file directly.
3. Native module versions, `backendLibrary`, API catalog construction, and production backend command code must not import preview-state files, directly or indirectly. A preview file may use type-only imports to check its shape; it imports no React view or registry.
4. Remove `defaultState` and `def` from `makeModuleVersion` inputs and outputs. Retain identity, version, sizing/limits, `stateShape`, `componentMetadata`, `hasPlaceholder`, and `defaultSpec`, including their current validation.
5. `makeModuleView` prepares the example once during view construction. Reuse its existing `decodeState` decoder with `onExcessProperty: "ignore"`, then expose the decoded `defaultState` and `def: { moduleId: module.id, state: defaultState }`. Both fields reference the same decoded state, preserving their existing relationship.
6. Preserve the existing App-facing `IModule` / `IModuleBrickDef` contracts and their consumers. `ModulePreview`, `ModulePlayground`, Brick detail, and module-detail routes continue using the view's `defaultState` / `def`; they should not need new sample imports or fallback branches.
7. Preserve excess-field stripping, particularly for GitHub Profile's larger example object. Preserve GitHub's 365 chronological UTC days and sample counts/levels, and Swatch and Icon's initial frame and animation order.
8. Preserve creation behavior: placeholder-backed modules submit null where they do today; Swatch and Icon submits the captured current preview state. Preserve cloning, nullable content, saved Brick state, Placement specs, and preview animation behavior.
9. Native descriptor `defaultValue` settings are contract/schema facts and stay in the native definitions. They are separate from the example `defaultState` being moved.
10. Backend Add/Update Brick validation remains authoritative and unchanged. Moving preparation of trusted UI examples does not remove any command input validation or introduce a new model-data writer. Reference [ADR 001](../adrs/001-wall-owned-layout-tree.md) for existing Brick content and Placement spec ownership.

## Concrete import changes

1. Today, this ordinary backend import reaches the sample generator:

   ```ts
   // apps/zerospin/src/modules/backendLibrary.ts
   import { githubActivityV1 } from "./githubActivity/githubActivityV1";
   // githubActivityV1.ts currently constructs defaultData and defaultState.
   ```

2. After implementation, the backend keeps that native import. App adds the preview import at its existing composition point:

   ```ts
   // apps/app/modules/githubActivity/githubActivityView.tsx
   import { githubActivityV1 } from
     "@qrk.sh/zerospin/src/modules/githubActivity/githubActivityV1";
   import { githubActivityPreviewState } from
     "@qrk.sh/zerospin/src/modules/githubActivity/githubActivityPreviewState";

   export const githubActivityView = makeModuleView(githubActivityV1, {
     // 1. The example is explicit input to App's view composition.
     defaultState: githubActivityPreviewState,
     LineIcon: GitHubActivityLineIcon,
     form: GitHubActivityForm,
     // Existing variants remain unchanged.
   });
   ```

3. The new file holds the existing generator and its output. Example using GitHub Activity's current algorithm:

   ```ts
   // apps/zerospin/src/modules/githubActivity/githubActivityPreviewState.ts
   import type { IInferDecodedRow } from "@zerospin/shapes";
   import type { githubActivityV1 } from "./githubActivityV1";

   const defaultData = {
     contributions: Array.from({ length: 365 }, (_, index) => {
       // 2. This work now runs only when a sample consumer imports this file.
       const date = new Date();
       date.setUTCDate(date.getUTCDate() - (364 - index));
       let sample = Math.imul(index + 1, 0x45d9f3b);
       sample = Math.imul(sample ^ (sample >>> 16), 0x45d9f3b);
       sample = (sample ^ (sample >>> 16)) >>> 0;
       const count = sample % 100 < 30 ? 0 : 1 + (sample % 15);
       const level: 0 | 1 | 2 | 3 | 4 =
         count === 0 ? 0 : count <= 3 ? 1 : count <= 7 ? 2 : count <= 11 ? 3 : 4;
       return { date: date.toISOString().slice(0, 10), count, level };
     }),
   };

   export const githubActivityPreviewState = {
     payload: { url: "https://github.com/morgs32" },
     data: defaultData,
   } satisfies IInferDecodedRow<typeof githubActivityV1.stateShape>;
   // Type-only imports do not introduce a runtime dependency on the definition.
   ```

4. Within the existing view constructor, reuse its decoder rather than constructing another one. Return excerpt:

   ```ts
   // 3. Existing decodeState still handles rendered state as before.
   const defaultState = decodeState(view.defaultState, {
     onExcessProperty: "ignore",
   });
   const def = { moduleId: module.id, state: defaultState };

   return {
     ...moduleFields,
     defaultState,
     def,
     // Existing LineIcon, variants, Form, and component fields remain.
   };
   ```

## Decisions and alternatives

1. Use explicit imports and concrete per-module values. Add no fixture registry, registration hook, factory, lazy getter, runtime environment switch, cache, barrel, or re-export layer.
2. Keep examples beside module source so App and backend tests can share plain data without a test-to-React dependency. App views own preparing display defaults, and native module definitions remain usable without samples.
3. Retain the App-facing `defaultState` / `def` names in this change. The approved split changes their owner and constructor input, avoiding unrelated changes across rendering and insertion code.
4. Reuse existing generics and inferred returns. Type the new view input from `MODULE["stateShape"]`; sample exports can use `satisfies IInferDecodedRow<typeof module.stateShape>`. Introduce no new named interfaces/types or casts. Let `def` infer naturally within the existing public view contract rather than carrying over the old `as unknown` expression.
5. `decodeDefaultData` currently has only the native factory as a caller. Once the view reuses its decoder and that call is removed, delete the unused helper. Do not replace it with another wrapper.
6. Build-time static samples would change GitHub date freshness. Moving required backend work to a first request would only shift its cost. Neither is needed when the backend does not use the examples at all.

## Implementation steps

1. Start an isolated implementation branch from PR #58 or its merged successor. Capture the current decoded examples for all ten modules, plus the backend bundle and three local startup profiles, before changing construction. Keep the SDK, System registry, native definitions, build settings, and machine matched across measurements.
2. Create the ten preview-state files. Move each module's example-only declarations and supplied `defaultState` expression; preserve native shapes, schema defaults, metadata, default specs, and behavior. Use type-only imports for shape checks when needed.
3. Remove the native factory's example input, decode, `def` construction, returned example fields, and now-unused type/helper imports. Delete the unused `decodeDefaultData.ts` file after confirming no remaining callers.
4. Update `makeModuleView` to drop `defaultState` / `def` requirements from its native-module constraint, accept required typed example input in the view options, decode it with existing `decodeState`, and derive its own returned fields. Leave the render/form decode paths and placeholder checks intact.
5. Update all ten App module views to import their own example files explicitly. Replace direct native-default reads in `SwatchAndIconPreview.tsx`, `ArticleForm.stories.tsx`, and `WallEditor.stories.tsx`. The Swatch animation should import plain sample data, not its owning view, avoiding a circular import.
6. Update the existing backend tests' direct Swatch sample imports. Keep model setup command-driven and preserve their existing success/rejection assertions. Do not import App views into backend tests or change the System to make tests pass.
7. Run the verification below; resolve in-scope failures. Confirm no production backend/API import path reaches a preview-state file, and that the native factory no longer decodes or exposes sample data.
8. Update the App module README and research record with the implemented ownership and measured result. Reconcile the existing glossary only with implemented domain terminology; add no implementation-only terms. Create an ADR only if the implemented decision proves hard to reverse, surprising without context, and the result of a real trade-off. Perform these documentation steps after implementation, not during planning.
9. Publish a separate ready-for-review PR following the catalog change, excluding unrelated feature work. Record the outcome, mark remaining work None, and archive this plan only after implementation and required verification are complete.

## Verification seams

1. **Example equivalence:** compare all ten newly prepared view defaults with the baseline decoded examples. For GitHub Activity, compare under the same controlled UTC date, including all 365 rows, order, counts, and levels. Confirm GitHub Profile excess fields are still discarded. Prefer a bounded comparison over retaining duplicate implementations or introducing a benchmark framework.
2. **Type/build boundaries:** run App/API typechecks; run the backend `test` target through Nx; build App and API through their Nx targets. App typing includes the stories and direct preview consumers that otherwise retain obsolete native `.defaultState` references. Do not call live providers.
3. **Existing behavior:** preserve the backend test suite's captured Swatch state and state-rejection cases. Check representative GitHub Activity and Swatch previews, the first/next Swatch animation frame, and their existing null-versus-captured-state insertion behavior using the current Storybook seams. Avoid broad UI/layout changes or new scaffolding.
4. **Import graph:** inspect the complete backend production bundle/dependency graph. It must contain none of the ten preview-state source files or GitHub's sample generator. API catalog construction must also avoid those fixtures. A type-only shape import is acceptable; native/backend runtime imports of examples are not.
5. **Startup:** compare bundle size and median active CPU from three matched local profiles per bundle. Use the catalog-separated baseline; do not compare different Systems or equate local profiles with Cloudflare upload timing. Report any observed gain or lack of gain honestly. Production deployment and remote startup remeasurement require their own authorization and are outside this plan.

## Planned file hierarchy

Legend: `+` create, `~` modify, `-` remove. The ten native versions and ten App views are explicit below; generator metadata and default specs stay intact.

```text
qrk.sh/
├── apps/zerospin/src/modules/
│   ├── article/
│   │   ├── ~ articleV1.ts
│   │   └── + articlePreviewState.ts
│   ├── figmaThumbnail/
│   │   ├── ~ figmaThumbnailV1.ts
│   │   └── + figmaThumbnailPreviewState.ts
│   ├── githubActivity/
│   │   ├── ~ githubActivityV1.ts
│   │   └── + githubActivityPreviewState.ts
│   ├── githubProfile/
│   │   ├── ~ githubProfileV1.ts
│   │   └── + githubProfilePreviewState.ts
│   ├── githubRepo/
│   │   ├── ~ githubRepoV1.ts
│   │   └── + githubRepoPreviewState.ts
│   ├── image/
│   │   ├── ~ imageV1.ts
│   │   └── + imagePreviewState.ts
│   ├── instagram/
│   │   ├── ~ instagramV1.ts
│   │   └── + instagramPreviewState.ts
│   ├── link/
│   │   ├── ~ linkV1.ts
│   │   └── + linkPreviewState.ts
│   ├── mapPlace/
│   │   ├── ~ mapPlaceV1.ts
│   │   └── + mapPlacePreviewState.ts
│   ├── swatchAndIcon/
│   │   ├── ~ swatchAndIconV1.ts
│   │   └── + swatchAndIconPreviewState.ts
│   └── make/
│       ├── ~ makeModuleVersion.ts
│       └── - decodeDefaultData.ts
├── apps/app/
│   ├── components/~ WallEditor.stories.tsx
│   └── modules/
│       ├── article/~ articleView.tsx
│       ├── article/~ ArticleForm.stories.tsx
│       ├── figmaThumbnail/~ figmaThumbnailView.tsx
│       ├── githubActivity/~ githubActivityView.tsx
│       ├── githubProfile/~ githubProfileView.tsx
│       ├── githubRepo/~ githubRepoView.tsx
│       ├── image/~ imageView.tsx
│       ├── instagram/~ instagramView.tsx
│       ├── link/~ linkView.tsx
│       ├── mapPlace/~ mapPlaceView.tsx
│       ├── swatchAndIcon/~ swatchAndIconView.tsx
│       ├── swatchAndIcon/~ SwatchAndIconPreview.tsx
│       ├── make/~ makeModuleView.tsx
│       └── ~ README.md
├── apps/zerospin/test/
│   ├── ~ brickBorderWidth.spec.ts
│   ├── ~ placementMoves.spec.ts
│   ├── ~ stackName.spec.ts
│   └── ~ system.spec.ts
└── wiki/
    ├── plans/+ 052-plan-module-preview-state.md
    └── research/~ backend-module-preview-catalog-startup.md
```

## Scope and remaining work

1. Scope is the preview-state import/construction split and its direct consumers. Keep catalog timing from PR #58, component metadata, native state validation, stored content/specs, System registrations/canonical selections, SDK versions, and unrelated feature work unchanged.
2. No implementation, glossary/ADR change, storage operation, provider call, deployment, commit, or PR update was performed for this planning step.
3. Remaining work: implement steps 1–9 and complete the listed verification after implementation is requested.
