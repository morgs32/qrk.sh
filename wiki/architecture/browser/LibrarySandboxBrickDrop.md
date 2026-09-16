---
title: Library sandbox brick preview and drop
updated: 2026-09-15
sources:
  - path: apps/library/app/routes/modules/ModulesPage.tsx
    sha: 47dfc8dfbefda0f64cd3f45025a02b037bfd6328
    lines: 10-45
  - path: apps/library/lib/BrickPreview.tsx
    sha: 76058457d5bafd25784c185bde7b68f1f1caa590
    lines: 8-27
  - path: apps/library/app/DraggableBrick.tsx
    sha: 3f2e301b91179092437ed16551ef32fedfbc5534
    lines: 7-38
  - path: apps/library/lib/BrickWall.tsx
    sha: 1fa785cfe1cb7f79e6896044255f72018f5fc229
    lines: 85-114
  - path: apps/library/lib/useGridStore.ts
    sha: 32294bf4c1c211e0043618a73cd20f43762bf778
    lines: 70-102
  - path: apps/library/lib/modulesHash.ts
    sha: 442bd44d274457668ba04522c2f6038e9f0f000e
    lines: 14-26
---

# Library sandbox brick preview and drop

Workbench `/modules` lists every [`IModule`](../../../apps/library/lib/types.ts) from [`modulesHash`](../../../apps/library/lib/modulesHash.ts), sizes a preview, and copies a def into [`useGridStore`](../../../apps/library/lib/useGridStore.ts) on native drag. [`BrickWall`](../../../apps/library/lib/BrickWall.tsx) sizes the drop placeholder from that store and calls `addBrick`. Identity lookup is [`BrickModule`](../BrickModule.md).

## Trigger

1. [`Layout`](../../../apps/library/app/routes/Layout.tsx) renders the drawer `Outlet` (`/modules` [`ModulesPage`](../../../apps/library/app/routes/modules/ModulesPage.tsx)) beside [`BrickWall`](../../../apps/library/lib/BrickWall.tsx).
2. The user drags a filmstrip preview onto the grid.

```mermaid
sequenceDiagram
  participant ModulesPage
  participant modulesHash
  participant BrickPreview
  participant DraggableBrick
  participant useGridStore
  participant BrickWall

  autonumber 1
  ModulesPage->>modulesHash: Object.values(modulesHash)
  autonumber 2
  modulesHash-->>ModulesPage: IModule[]
  autonumber 3
  ModulesPage->>BrickPreview: BrickPreview(...)
  autonumber 4
  ModulesPage->>DraggableBrick: DraggableBrick(...)
  autonumber 5
  DraggableBrick->>useGridStore: setActiveBrickDrag(...)
  autonumber 6
  BrickWall->>useGridStore: activeBrickDrag[breakpoint]
  autonumber 7
  useGridStore-->>BrickWall: w, h
  autonumber 8
  BrickWall->>useGridStore: addBrick(...)
  autonumber 9
  useGridStore->>modulesHash: modulesHash[brickDef.moduleId]
  autonumber 10
  modulesHash-->>useGridStore: brickModule
  autonumber 11
  useGridStore-->>BrickWall: bricksById updated
```

## Annotated workflow steps

1. The filmstrip reads the hash as an array of modules.
   - [`ModulesPage.tsx:10-17`](../../../apps/library/app/routes/modules/ModulesPage.tsx#L10-L17) — `Object.values(modulesHash)` then `modules.map((brickModule) => ...)`. (`apps/library/app/routes/modules/ModulesPage.tsx:10-17`)
2. Each entry is a full `IModule` (`def`, `component`, `defaultData`).
   - [`modulesHash.ts:14-26`](../../../apps/library/lib/modulesHash.ts#L14-L26) — kebab keys to assembler results. (`apps/library/lib/modulesHash.ts:14-26`)
3. Preview size is `round(gridWidth / 8 * w)` by `round(gridWidth / 8 * h)`.
   - [`ModulesPage.tsx:36`](../../../apps/library/app/routes/modules/ModulesPage.tsx#L36) — `BrickPreview w={def[breakpoint].w} h={def[breakpoint].h}`. (`apps/library/app/routes/modules/ModulesPage.tsx:36`)
   - [`BrickPreview.tsx:13-16`](../../../apps/library/lib/BrickPreview.tsx#L13-L16) — whole-pixel width/height from `useBrickBreakpoint().gridWidth`. (`apps/library/lib/BrickPreview.tsx:13-16`)
4. The preview surface is a native drag source carrying `brickModule.def`.
   - [`ModulesPage.tsx:37-43`](../../../apps/library/app/routes/modules/ModulesPage.tsx#L37-L43) — `DraggableBrick brickDef={def}` wrapping `BrickComponent` with `data={def.data}`. (`apps/library/app/routes/modules/ModulesPage.tsx:37-43`)
5. Drag start clones the def into Zustand and sets `text/plain` to `moduleId`.
   - [`DraggableBrick.tsx:22-35`](../../../apps/library/app/DraggableBrick.tsx#L22-L35) — `setActiveBrickDrag(structuredClone(brickDef))`, drag image, `effectAllowed = "copy"`. (`apps/library/app/DraggableBrick.tsx:22-35`)
6. Grid drop-over reads the in-flight def at the measured breakpoint.
   - [`BrickWall.tsx:88-93`](../../../apps/library/lib/BrickWall.tsx#L88-L93) — `onDragOver` returns false without `activeBrickDrag`, else `{ w, h }` from `activeBrickDrag[breakpoint]`. (`apps/library/lib/BrickWall.tsx:88-93`)
7. Those numbers are the placeholder size.
   - [`BrickWall.tsx:93`](../../../apps/library/lib/BrickWall.tsx#L93) — `return { w: activeBrickDrag[breakpoint].w, h: activeBrickDrag[breakpoint].h }`. (`apps/library/lib/BrickWall.tsx:93`)
8. Drop allocates a brick id and calls `addBrick`.
   - [`BrickWall.tsx:95-113`](../../../apps/library/lib/BrickWall.tsx#L95-L113) — `crypto.randomUUID()`, rewrite dropped `i`/`w`/`h`, `addBrick(...)`, then `setActiveBrickDrag(null)`. (`apps/library/lib/BrickWall.tsx:95-113`)
9. Persist looks up the module again for options defaults.
   - [`useGridStore.ts:70-78`](../../../apps/library/lib/useGridStore.ts#L70-L78) — `brickModule = modulesHash[brickDef.moduleId]` then `brickModule?.component.options.decode(...)`. (`apps/library/lib/useGridStore.ts:70-78`)
10. Missing hash yields empty options `{}`.
    - [`useGridStore.ts:74-78`](../../../apps/library/lib/useGridStore.ts#L74-L78) — optional chain; no options config becomes `{}`. (`apps/library/lib/useGridStore.ts:74-78`)
11. The store writes `bricksById[brickId]` (`moduleId`, `data`, `sm` placement, optional explicit breakpoint) and runs `setLayout`.
    - [`useGridStore.ts:79-101`](../../../apps/library/lib/useGridStore.ts#L79-L101) — `set` of the placed brick then `useGridStore.getState().setLayout(layout, breakpoint)`. (`apps/library/lib/useGridStore.ts:79-101`)
