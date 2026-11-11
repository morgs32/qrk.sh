# 059 · Render Brick layouts from JSON specs

## App rendering

The [Wall-owned layout ADR](../../adrs/001-wall-owned-layout-tree.md) describes Placement spec ownership.

1. Require a JSON Render registry for each App module. Use the versioned module's default spec and remove its authored whole-Brick component. Keep the leaf React components registered in each catalog.
2. Use the default spec in the picker. On the Wall, use the Placement's saved spec or the module default. Keep the module placeholder when Brick state is null and show the shared **This brick has no saved content** status when configured state has null fetched data. Preserve forms and Article inline editing.
3. Keep the Swatch and Icon timer and pause conditions. Use JSON Render as the animation's child and key it by the current frame revision so the visible frame and captured drag state commit together.

```tsx
// The picker uses the module default and the current example.
<Render state={previewState} variantId="default" spec={view.spec} />

// A saved Placement chooses its own spec.
<Render state={brick.state} variantId={placement.variantId} spec={placementSpec} />
```

## Storybook

1. Replace ModulePlayground with shared Breakpoint Previews. Each story supplies a JSX sketch typed from its module state schema. Show that sketch and JSON Render together at sm, md, lg, and xl, using one example and one active spec.
2. Use StyleInspector's bottom-docked tab treatment. Show the existing module form once under **Configure** and retain its draft across tab switches. Saving updates every row. Article uses its existing inline editor stories and opens the drawer on **Generate Spec**.
3. Keep the prompt form and generated JSON under **Generate Spec**. Successful generation updates all four JSON previews. A request failure keeps the previous output visible. **Reset to default** restores the module spec. Edit the source default spec for exact hand changes.
4. Keep example edits and generated specs local to the story. Preserve form lookup and upload wiring. Remove the old metadata and Brick Definition panels.

`+` adds a path, `~` updates it, and `−` removes it.

```text
qrk.sh/
├── apps/app/
│   ├── .storybook/
│   │   ├── + BrickBreakpointPreviews.tsx
│   │   ├── − ModulePlayground/
│   │   └── ~ preview.css
│   ├── app/[username]/site/[siteId]/page/[pageId]/Modules/
│   │   └── ~ ModulePreview.tsx
│   ├── ~ components/WallEditor/WallEditor.tsx
│   └── modules/
│       ├── ~ make/makeModuleView.tsx, types.ts, and README.md
│       ├── ~ module view declarations and stories
│       ├── ~ swatchAndIcon/SwatchAndIconPreview.tsx
│       └── − swatchAndIcon/SwatchAndIcon.tsx
└── wiki/
    ├── + archive/plans/059-plan-json-render-brick-previews.md
    └── ~ brick-layout-conventions.md and glossary.md
```

## Verification

1. Build App and Storybook through Nx. Open all ten module stories and check all four widths for render errors.
2. Check form save, drawer draft retention, prompt success and failure, and reset in Storybook. Exercise the existing Article editor stories.
3. Check the Wall's saved and default specs, unconfigured placeholder, and missing-content status. Verify the picker draws JSON Render output and a Swatch drag captures the visible frame after a cycle.
4. Reconcile the glossary and layout conventions with the verified implementation. Persisted data, spec schemas, and System registrations retain their existing contracts.

## Outcome

1. The App and Storybook builds passed through Nx. App TypeScript and diff whitespace checks passed.
2. Chromium rendered all ten configured module stories at all four Breakpoints. It verified the Link placeholder, one form save updating all eight Swatch previews, draft retention across tabs, generation success and failure via mocked RPC, reset, and Article body-first autosave.
3. Chromium verified Swatch cycling and pause on drag, and matched the inserted Placement's icon and color to the captured frame. A mock Wall verified a distinct saved spec, the default fallback with an absent spec at the view, and the shared missing-content status. The registered Placement schema still requires a populated spec.
4. Updated the module README, layout conventions, and glossary. The change did not require a new ADR.

## Remaining work

None.
