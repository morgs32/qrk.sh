---
title: Brick module identity and lookup
updated: 2026-09-19
sources:
  - path: apps/library/make/defineModule.ts
    sha: c2bcb482f69168cd7671fcc520a19b176a1739a3
    lines: 7-21
  - path: apps/library/modules/githubProfile/githubProfile.ts
    sha: 670b49bddf14ce386ef1cefe900b32a1175212fd
    lines: 3-8
  - path: apps/library/modules/githubProfile/githubProfileView.tsx
    sha: f40b241bfb6aba781144e66c8be295e29b673108
    lines: 7-11
  - path: apps/library/lib/modulesHash.ts
    sha: e3d00c9d7842ef8ece11a40943b6d2cc0d8eb032
    lines: 14-25
  - path: apps/library/backendLibrary.ts
    sha: afb22bcba1d72b5fd6ce55c070ad908c23a69367
    lines: 13-24
  - path: apps/library/lib/index.ts
    sha: 94d29bc207e39f4349bc17ae475d6e44db06e437
    lines: 1-2
  - path: apps/library/app/routes/modules/$moduleId.tsx
    sha: e3da537e9753b6e6271e7526532197e084090cc8
    lines: 8-12
  - path: apps/library/app/routes/modules/$moduleId/index.tsx
    sha: ec39cb40d475faf32cb58ee62f0413ee8bfb19dc
    lines: 26-40
  - path: apps/studio/app/routes/BrickGroupRoute.tsx
    sha: 456fae9a57db96e14092d608f9f981697d139e33
    lines: 22-22
  - path: apps/library/components/brick/BrickWrapper.tsx
    lines: 6-26
  - path: apps/library/lib/types.ts
    sha: 32db2cab47c9e341e6356d5f3c902fc7017d792b
    lines: 14-28
  - path: apps/library/make/makeModuleView.tsx
---

# Brick module identity and lookup

Each assembler calls [`defineModule`](../../apps/library/make/defineModule.ts) for the worker-safe contract and [`makeModuleView`](../../apps/library/make/makeModuleView.tsx) for the authored brick and optional json-render generator. [`makeBackendLibrary`](../../apps/library/backendLibrary.ts) keys the contracts by id. [`modulesHash`](../../apps/library/lib/modulesHash.ts) is the matching view map. Routes bind that value as `brickModule`. Preview and drag are [`LibrarySandboxBrickDrop`](./browser/LibrarySandboxBrickDrop.md) and [`SiteEditorBrickDrop`](./browser/SiteEditorBrickDrop.md).

Library sandbox walls store shared module `state` on the brick row
and per-breakpoint Spec / grid / visibility on Placement rows. The library
frontend is assembled once from `backendLibrary` through
[`makeLibraryFrontend`](../../apps/library/makeLibraryFrontend/makeLibraryFrontend.ts)
(see [`brick-layout-conventions`](../brick-layout-conventions.md)). Studio’s wall still
uses the exported Zustand `BrickWall` path until a separate migration.

## Trigger

1. The library bundle evaluates each `modules/<camelCase>/` definition, then [`backendLibrary.ts`](../../apps/library/backendLibrary.ts) and [`modulesHash.ts`](../../apps/library/lib/modulesHash.ts).
2. [`@qrk.sh/library`](../../apps/library/lib/index.ts) re-exports `modulesHash` for studio.
3. Workbench navigation hits TanStack file routes under `modules`, `modules/:moduleId`, and `bricks/:brickId`.
4. Studio group detail hits [`BrickGroupRoute`](../../apps/studio/app/routes/BrickGroupRoute.tsx) with `groupName`.

```mermaid
sequenceDiagram
  participant githubProfile
  participant defineModule
  participant makeModuleView
  participant modulesHash
  participant ModulePage_loader as ModulePage.loader
  participant ModuleDetail
  participant Brick

  autonumber 1
  githubProfile->>defineModule: defineModule(...)
  autonumber 2
  defineModule-->>githubProfile: contract
  autonumber 3
  githubProfile->>makeModuleView: makeModuleView(githubProfileV1, { default })
  autonumber 4
  makeModuleView-->>githubProfile: IModule
  autonumber 5
  modulesHash->>modulesHash: modulesHash["github-profile"] = githubProfileView
  autonumber 6
  ModulePage_loader->>modulesHash: modulesHash[params.moduleId]
  alt missing id or hash miss
    autonumber 7
    modulesHash-->>ModulePage_loader: undefined
    autonumber 8
    ModulePage_loader-->>ModulePage_loader: 404 Response
  else present
    autonumber 9
    modulesHash-->>ModulePage_loader: IModule
    autonumber 10
    ModuleDetail->>modulesHash: modulesHash[moduleId]
    autonumber 11
    modulesHash-->>ModuleDetail: brickModule
    autonumber 12
    ModuleDetail->>Brick: brickModule.component(...)
    autonumber 13
    Brick->>Brick: Authored or Renderer; callers wrap BrickWrapper
  end
```

## Annotated workflow steps

1. An assembler passes kebab-case `id`, Zerospin `abbreviation`, `label`, and `description` into `defineModule`.
   - [`githubProfile.ts:3-8`](../../apps/library/modules/githubProfile/githubProfile.ts#L3-L8) — `githubProfile` is `defineModule({ id: "github-profile", abbreviation: "ghp", ... })`. (`apps/library/modules/githubProfile/githubProfile.ts:3-8`)
2. The factory rejects non-kebab ids and returns the identity fields including `abbreviation`.
   - [`defineModule.ts:7-21`](../../apps/library/make/defineModule.ts#L7-L21) — kebab-case `id` check and identity return. (`apps/library/make/defineModule.ts:7-21`)
3. `makeModuleView` attaches the authored brick and optional generator (`registry` + `defaultSpec`).
   - [`githubProfileView.tsx`](../../apps/library/modules/githubProfile/githubProfileView.tsx) — `makeModuleView(githubProfileV1, { default: { component, generator } })`.
4. The returned value is an [`IModule`](../../apps/library/lib/types.ts) with `component`.
   - [`types.ts:14-28`](../../apps/library/lib/types.ts#L14-L28) — `IModule` identity including `abbreviation`, catalog, registry. (`apps/library/lib/types.ts:14-28`)
5. The hash is a `Record<string, IModule>` keyed by kebab `id`, checked against the backend map.
   - [`modulesHash.ts:14-25`](../../apps/library/lib/modulesHash.ts#L14-L25) — `"github-profile": githubProfileView` and the other assemblers. (`apps/library/lib/modulesHash.ts:14-25`)
   - [`backendLibrary.ts:13-24`](../../apps/library/backendLibrary.ts#L13-L24) — `defineModule` results keyed by id. (`apps/library/backendLibrary.ts:13-24`)
   - [`index.ts:1-2`](../../apps/library/lib/index.ts#L1-L2) — package export of `modulesHash` and `IModule`. (`apps/library/lib/index.ts:1-2`)
6. The module parent `beforeLoad` admits only registered `params.moduleId`.
   - [`$moduleId.tsx:8-12`](../../apps/library/app/routes/modules/$moduleId.tsx#L8-L12) — 404 when `params.moduleId` is not in `modulesHash`. (`apps/library/app/routes/modules/$moduleId.tsx:8-12`)
7. A miss on that lookup is `undefined`.
   - [`$moduleId.tsx:10-11`](../../apps/library/app/routes/modules/$moduleId.tsx#L10-L11) — `if (modulesHash[params.moduleId] === undefined)`. (`apps/library/app/routes/modules/$moduleId.tsx:10-11`)
8. The parent throws `notFound()`.
   - [`$moduleId.tsx:11-11`](../../apps/library/app/routes/modules/$moduleId.tsx#L11) — `throw notFound()`. (`apps/library/app/routes/modules/$moduleId.tsx:11`)
9. A hit means the child index route renders.
   - [`$moduleId.tsx:14-16`](../../apps/library/app/routes/modules/$moduleId.tsx#L14-L16) — parent renders `<Outlet />`. (`apps/library/app/routes/modules/$moduleId.tsx:14-16`)
10. The module detail pane looks up the same key as `brickModule`.
    - [`index.tsx:26-30`](../../apps/library/app/routes/modules/$moduleId/index.tsx#L26-L30) — `brickModule = modulesHash[moduleId]`, then pane 404 on miss. (`apps/library/app/routes/modules/$moduleId/index.tsx:26-30`)
    - [`BrickGroupRoute.tsx:28-28`](../../apps/studio/app/routes/BrickGroupRoute.tsx#L28) — studio detail uses `Object.values(modulesHash).find((candidate) => candidate.id === groupName)` as `brickModule`. (`apps/studio/app/routes/BrickGroupRoute.tsx:28`)
11. The hash returns that `IModule`.
    - [`index.tsx:27`](../../apps/library/app/routes/modules/$moduleId/index.tsx#L27) — `const brickModule = modulesHash[moduleId]`. (`apps/library/app/routes/modules/$moduleId/index.tsx:27`)
12. Render uses `brickModule.component` as `Brick`.
    - [`index.tsx:39-40`](../../apps/library/app/routes/modules/$moduleId/index.tsx#L39-L40) — `const brick = brickModule` then `BrickComponent = brick.component`. (`apps/library/app/routes/modules/$moduleId/index.tsx:39-40`)
    - [`BrickGroupRoute.tsx:68`](../../apps/studio/app/routes/BrickGroupRoute.tsx#L68) — `BrickComponent = brickModule.component`. (`apps/studio/app/routes/BrickGroupRoute.tsx:68`)
13. `Brick` renders Authored or json-render `Renderer`. Fill vs measure chrome is applied by the caller (`BrickWrapper` / `MeasuredBrickWrapper`). Json-render `BrickShell` is a filling flex column so Body+Footer pin correctly even when drag wrappers sit between the shell and `BrickWrapper`.
    - [`makeModuleView.tsx`](../../apps/library/make/makeModuleView.tsx) — no fill wrapper around Authored/`Renderer`.
    - [`BrickWrapper.tsx:6-26`](../../apps/library/components/brick/BrickWrapper.tsx#L6-L26) — `qrk-bricks` fill wrapper (`h-full w-full`). (`apps/library/components/brick/BrickWrapper.tsx:6-26`)
    - [`layoutRegistryComponents.tsx:61`](../../apps/library/lib/jsonRender/layoutRegistryComponents.tsx#L61) — `BrickShell` registry renders `BrickShell` (`flex h-full flex-col`). (`apps/library/lib/jsonRender/layoutRegistryComponents.tsx:61`)
