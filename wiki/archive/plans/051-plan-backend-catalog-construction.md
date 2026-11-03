# 051 — Keep catalog construction out of the Zerospin backend

**Status:** Complete. Implemented and verified in [PR #58](https://github.com/morgs32/qrk.sh/pull/58), ready for review and stacked on PR #56.

## Problem and agreed behavior

1. Native module definitions currently construct json-render catalogs, bringing Zod conversion into the Zerospin Worker's global initialization even though App and API consume those catalogs.
2. Use `componentMetadata` for module-owned descriptions and `propsShape` for the complete props object's Zerospin shape. React implementations remain in App; runtime json-render `components`/`props` names stay unchanged.
3. Extract the existing `makeCatalogFromComponentMetadata` conversion and call it only from App registries and API generation infrastructure. API constructs all catalogs once at module initialization, preserving current request behavior.
4. Preserve component-name validation in `makeModuleVersion`, native component metadata, state validation, `$state` bindings, nullable props, slots/descriptions, and initial Placement specs. Preview sample data remains in its current construction path for a later change.
5. Preserve every System registration and canonical selection. No SDK release, schema migration, storage operation, or deployment belongs to this change.

## Terminology, decisions, and alternatives

1. Component metadata describes an allowed component; it is not a React component. `propsShape` contains Zerospin descriptors, from which the existing Effect and Zod schema builders derive their respective schemas.
2. API catalogs remain eager once per isolate. Per-request construction would move work onto requests and is unnecessary for removing the backend dependency edge.
3. Separate imports establish the ownership boundary. Lazy getters, dynamic-import machinery, caches, and a second component vocabulary are unnecessary.
4. Reference [ADR 001](../../adrs/001-wall-owned-layout-tree.md) for the existing distinction between shared Brick content and Placement-owned rendering specs; this change preserves it.

## Annotated examples

```ts
// 1. Describe allowed props without importing a React implementation.
const rowComponentMetadata = defineComponentMetadata({
  type: "Row",
  propsShape: { gap: primitives.integer() },
});
```

```ts
// 2. API builds catalogs once when its generation module initializes.
const catalogs = mapValues(backendLibrary, (module) =>
  makeCatalogFromComponentMetadata(module.componentMetadata),
);
// 3. A validated module identity selects its already constructed catalog.
const catalog = catalogs[entry.id];
```

## Implementation and verification

1. Complete the naming cleanup across metadata files, module properties, schema builders, React adapters, and command/API callers.
2. Extract the existing catalog conversion into its defining file; move its Zod/json-render imports with it. Keep component-key checks in the native module factory, remove its catalog call/output, and remove obsolete optional catalog fields and guards.
3. Update all ten App registries and API's once-per-isolate catalog map. Preserve API error behavior for unknown module IDs and existing Effect validation of generated specs.
4. Compare all ten catalog JSON schemas and standalone prompts before/after. Run backend behavioral tests through Nx, App/API typechecks, and App/API builds. Do not call a live generation provider.
5. Build matched baseline/candidate production bundles with the same System and SDK. Compare three local startup profiles per bundle, inspect dependencies for catalog/Zod code, and report local evidence separately from Cloudflare deployment measurements.
6. Update the module README and research findings to describe the implemented ownership and measured limits. Reconcile existing glossary terminology after implementation; add no implementation-only glossary terms. Create an ADR only if the result proves hard to reverse, surprising without context, and the result of a real trade-off.
7. Commit only this isolated work and open a ready PR stacked on the existing Zerospin 39 adoption PR. Record results and archive this plan once no required work remains.

## Planned files

Legend: `+` create; `~` modify, including metadata file/symbol renames.

```text
qrk.sh/
├── apps/zerospin/src/modules/
│   ├── make/
│   │   ├── ~ defineComponentMetadata.ts (renamed from defineComponent.ts)
│   │   ├── + makeCatalogFromComponentMetadata.ts
│   │   ├── ~ makeModuleVersion.ts
│   │   ├── ~ makeBackendLibrary.ts
│   │   ├── ~ makeComponentSpecSchema.ts
│   │   └── ~ makeModuleSpecDocumentSchema.ts
│   ├── ~ lib/jsonRender/layoutComponentMetadata.ts
│   └── ~ each module's version declaration and generator/*ComponentMetadata.ts
├── apps/zerospin/src/aggregates/user/contracts/brick/
│   ├── ~ GenerateBrickSpecV1.ts
│   ├── ~ GenerateBrickSpecExternalV1.ts
│   └── ~ GenerateBrickSpecExternalV2.ts
├── apps/app/modules/
│   ├── ~ make/makeComponentView.tsx
│   ├── ~ make/makeModuleView.tsx
│   ├── ~ lib/types.ts
│   ├── ~ each metadata-consuming React view
│   ├── ~ each module's generator/*JsonRenderRegistry.tsx (ten registries)
│   └── ~ README.md
├── apps/api/modules/~ generateSpec.ts
└── wiki/
    ├── plans/+ 051-plan-backend-catalog-construction.md
    └── research/
        ├── + backend-module-preview-catalog-startup.md
        └── ~ page-brick-card-styling.md (repair renamed source link)
```

## Verification outcome

1. All ten catalog JSON schemas and standalone prompts match the baseline exactly. Native metadata-key rejection and API unknown-module/missing-provider-key rejection pass without provider calls.
2. The isolated SDK 39 base passes 17 backend tests in four files, App/API typechecks, App client/server build with prerendering, and API dry-run build.
3. The matched backend bundle shrank from 5169.39 to 4329.92 KiB (839.47 KiB, 16.2%). Catalog/json-render/Zod runtime sections are absent from the candidate.
4. Median local active startup CPU across three profiles per bundle fell from 421.173 to 364.753 ms (13.4%). These are matched local results, not the earlier feature bundle's remote timing. See the [research evidence](../../research/backend-module-preview-catalog-startup.md#implemented-catalog-separation-and-matched-verification).
5. Module documentation was reconciled. No domain glossary changes or ADR are warranted by this routine, reversible construction change. Source/naming updates leave System registrations and canonical selections unchanged.
6. The main checkout's 28 unrelated changed files and staged patch remain byte-identical; the PR work is isolated in `/private/tmp/qrk-backend-module-catalogs`.

## Remaining work

None. The preview-state separation described in the research note is a separate,
future change, outside this completed catalog extraction.
