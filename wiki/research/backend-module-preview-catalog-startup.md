# Backend module preview and catalog startup work

Researched 2026-11-03. This addresses item 2 in
[the startup investigation](./worker-startup-and-cold-start-latency.md): keeping
preview fixtures and generation catalogs out of the Zerospin Worker's import
graph. Research only; the only new workspace file is this note.

## Finding

**Separate module facts from their preview data and constructed catalogs.** QRK's
backend needs the native module definitions, but the current factory also eagerly
constructs data that only App/API consumers use. This is a QRK module-library
boundary, not a demonstrated Zerospin framework defect.
[Backend library](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/backendLibrary.ts:1),
[factory](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/make/makeModuleVersion.ts:88).

`backendLibrary` imports ten full module versions. Each calls
`makeCatalogFromComponentMetadata`, building Zod schemas for its component properties,
then `defineCatalog`. The installed json-render 0.20.0 implementation eagerly
builds a complete spec Zod schema; it does not merely retain descriptors for a
later prompt. Each module also decodes its supplied preview state and builds
`def` from that state during construction.
[Imports](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/backendLibrary.ts:13),
[catalog construction](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/make/makeModuleVersion.ts:16),
[eager spec schema](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@json-render/core/dist/index.js:2244),
[default-state decoding](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/make/decodeDefaultData.ts:7).

GitHub Activity additionally generates 365 dated contribution samples before
calling the factory. Every row constructs and adjusts a Date and formats an ISO
date. Moving only the decoder or changing the factory to ignore this argument
would leave that top-level sample generation in place.
[Fixture construction](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/githubActivity/githubActivityV1.ts:39).

## What each consumer actually needs

- **Zerospin commands need native facts:** identity, sizing/limits, placeholder
  policy, `stateShape`, `defaultSpec`, and component descriptors. Add Brick decodes
  submitted state and persists `defaultSpec` into new Placements. Generated-spec
  continuations validate returned content against the module's descriptors using
  Effect Schema. Preserve both validation paths and their current ownership.
  [State and limits](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV5.ts:53),
  [initial spec](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV5.ts:228),
  [generated-spec validation](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecExternalV2.ts:164),
  [Effect schema construction](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/make/makeModuleSpecDocumentSchema.ts:8).
- **The API needs a constructed catalog** for the selected module's generation
  prompt. It also validates the resulting spec against the native descriptors.
  [Prompt use](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/generateSpec.ts:130),
  [result validation](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/generateSpec.ts:174).
- **App needs catalogs and preview state.** Its ten json-render registries consume
  catalogs, and the view constructor currently checks catalog availability.
  `ModulePreview` starts from `def.state`; `ModulePlayground` starts from
  `defaultState`. These examples are production UI data, not development-only
  fixtures. Placeholder-backed drawer insertion submits null; Swatch and Icon
  submits the captured state, so its preview state remains meaningful creation
  input even though the backend does not supply it.
  [Representative registry](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/githubActivity/generator/GitHubActivityJsonRenderRegistry.tsx:11),
  [view constructor](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/make/makeModuleView.tsx:74),
  [preview and drag payload](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/ModulePreview.tsx:28),
  [playground](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/ModulePlayground.tsx:28).
- **Backend tests use preview defaults as fixtures.** Removing `defaultState` from
  native definitions requires explicit fixture imports in those tests; it does
  not justify importing React view construction into the backend test graph.
  [Example test](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/test/brickBorderWidth.spec.ts:132),
  [system test](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/test/system.spec.ts:91).

A scoped search of `apps/zerospin/src` found no runtime reads of module `.catalog`,
`.defaultState`, or `.def` outside their construction. The backend's generated
spec validator reads `.componentMetadata`, so removing those descriptors would remove a
real check rather than eliminate unused work.
[Factory outputs](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/make/makeModuleVersion.ts:106),
[descriptor use](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecExternalV2.ts:165).

## Evidence about the possible saving

Reanalyzing the three saved SDK 39 startup CPU profiles gives these **mean
inclusive sampled times**:

- Catalog construction: **5.54 ms**.
- Default-state decoding: **1.26 ms**.
- GitHub's 365-row callback: **6.62 ms**.
- The union of module-factory and GitHub callback stacks: **13.41 ms**, about
  **5.1%** of the mean **263.65 ms** captured active CPU.

For each profile, samples were weighted by their `timeDeltas` and attributed to
the named frame or its descendants. The GitHub callback is the anonymous frame
at zero-based Worker source line 67408. Each sample was counted once for the
union; catalog/decoder time is already included in module-factory time. Per-run
union totals were 12.545, 11.302, and 16.393 ms.
[Profile 1](/private/tmp/qrk-startup-39/startup-1.cpuprofile),
[profile 2](/private/tmp/qrk-startup-39/startup-2.cpuprofile),
[profile 3](/private/tmp/qrk-startup-39/startup-3.cpuprofile),
[matching serialized bundle](/private/tmp/qrk-startup-39/cloudflare-check.bundle).

The saved bundle also contains approximately **800 KiB of source sections**
headed by Zod, json-render core/schema, and the Zerospin Zod bridge; approximately
744 KiB is Zod. This tally follows emitted source-section comments and is **not a
measurement of removable bytes**. Removing the catalog dependency edge could
reduce additional module evaluation and parse work, but only a rebuilt complete
Worker can establish which dependencies disappear and the actual size change.
The module factory is the only runtime import of these catalog/Zod helpers found
in QRK's backend source; its other json-render imports are type-only.
[Serialized bundle](/private/tmp/qrk-startup-39/cloudflare-check.bundle),
[runtime imports](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/make/makeModuleVersion.ts:1),
[representative type-only import](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/githubActivity/generator/defaultSpec.ts:1).

These samples identify an opportunity, not a promised 13 ms improvement or a
projection from the local profile to Cloudflare's reported 709 ms. Cloudflare
counts parsing and global execution toward its startup limit and recommends
removing expensive global work or doing it at build/handler time.
[Cloudflare startup guidance](https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time).

## Recommended shape to investigate in implementation

1. **Keep `makeModuleVersion` concrete and native.** Preserve its shared facts,
   validation, `stateShape`, component descriptors, and `defaultSpec`. Remove
   catalog/default-state construction from this path. Keep all existing System
   registrations, canonical selections, persisted schemas, and command behavior.
   This proposal changes construction ownership, not accepted command inputs.
2. **Extract the existing `makeCatalogFromComponentMetadata` implementation into its
   defining file.** Its call sites would be `apps/api/modules/generateSpec.ts`
   and the ten `apps/app/modules/*/generator/*JsonRenderRegistry.tsx` files.
   Build the API catalog for the selected module inside generation; App can
   construct catalogs when defining its registries. Keep the `$state` unions,
   nullable-property handling, slots, and descriptions exactly as currently
   authored. This reuses the existing conversion rather than adding a second
   descriptor vocabulary or a generic registry/cache.
   [Existing conversion](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/make/makeModuleVersion.ts:16).
3. **Move each module's sample state into a separate module-owned fixture file**
   imported by App and tests, never by its native version definition. The files
   can remain beside the shared module source; no App-to-API dependency is
   needed. Supply preview state to the existing view composition, decode it
   there using the module's state shape, and derive `defaultState`/`def` there.
   Preserve excess-field stripping: GitHub Profile's supplied example currently
   contains more fields than its declared shape.
   [View outputs](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/make/makeModuleView.tsx:167),
   [decoder policy](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/make/decodeDefaultData.ts:11),
   [profile fixture](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/githubProfile/githubProfileV1.ts:49).

This recommendation introduces no new laziness framework. A getter on the same
object would retain the catalog dependencies, and a preview callback would not
help if its 365-row argument is still computed at module evaluation. A
`NODE_ENV` condition would also be the wrong boundary because production App
uses previews. A genuine import boundary removes work from the Zerospin Worker
instead of scheduling that unused work on its first request. Merely adding
`import()` also needs care: Wrangler normally bundles a dynamically imported
file into the entrypoint unless separate-module rules apply.
[Current eager argument](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/githubActivity/githubActivityV1.ts:39),
[production preview consumer](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/ModulePreview.tsx:28),
[Wrangler bundling behavior](https://developers.cloudflare.com/workers/wrangler/bundling/#find-additional-modules).

## What would establish completion

An implementation should preserve valid/invalid Brick state handling,
placeholder/null policy, initial Placement specs, and generated-spec validation;
retain App previews and generation; and update fixture imports in existing
behavioral tests. Rebuild the complete Worker and inspect its dependency graph
for preview/catalog code, then compare repeated local startup profiles against
a matched baseline. Report Cloudflare startup CPU separately if a deployment is
authorized. No application changes, builds, deployments, or storage operations
were performed for this research.
