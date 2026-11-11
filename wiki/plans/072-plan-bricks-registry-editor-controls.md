# Plan 072 — Use shadcn registry controls in Brick editors

Adopt the registry shells for Map Place results, Image crop, and Fit. Keep
Bricks' shared Field, Input Group, and Tabs parts. Reuse Plan 069's compact
input action when it lands. Align already uses Base UI Radio Group with
segmented icon choices and keeps that composition. [Adoption audit](../research/shadcn-component-adoption-audit.md#bricks)

## Implementation and call sites

1. Replace the result popup, list, and item shell at
   [GooglePlaceLookup](../../apps/bricks/src/modules/mapPlace/react/GooglePlaceLookup.tsx#L226-L251)
   with the shadcn Combobox Content, List, and Item parts adapted in
   `react/combobox.tsx`. Keep the existing Root, input group, clear callback,
   status and empty messages, and render-prop result rows. Keep the 4px offset,
   anchor-width popup, compact styles, async provider filtering, attribution,
   and selection identity. The live caller is [MapPlaceForm](../../apps/bricks/src/modules/mapPlace/react/MapPlaceForm.tsx#L109).
   [shadcn Combobox](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/combobox.tsx)
2. In [ImageUploadInput](../../apps/bricks/src/components/ImageUploadInput.tsx#L111-L173),
   adopt the shadcn Dialog shell in `react/dialog.tsx` and the existing Bricks
   `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent` parts for the Upload,
   URL, and Crop panels. Keep the controlled dialog, backdrop, focus return,
   visible Cancel action, and responsive scrollable size. Set the registry
   Dialog Content's `showCloseButton` to false so the existing footer
   owns dismissal. Use the existing
   text tab styles as local overrides. Keep Crop mounted while switching
   tabs, and preserve disabled tabs during Apply. [Dialog registry](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/dialog.tsx) · [Bricks Tabs](../../apps/bricks/src/components/tabs.tsx)
3. Replace the [Image Zoom slider](../../apps/bricks/src/components/ImageUploadInput.tsx#L260-L274)
   with the shadcn Slider structure in `react/slider.tsx`. This editor
   needs one thumb with `aria-labelledby` on the thumb, so give the copied
   registry's thumb the existing label association and keep center alignment.
   Keep range 1–20, step 0.05, disabled state, and live crop updates. Preserve
   upload, pan, Apply/Cancel, and abort behavior at
   [ImageForm](../../apps/bricks/src/modules/image/react/ImageForm.tsx#L68), the
   [Image Upload Docs example](../../apps/bricks/src/components/ImageUploadInputExample.tsx),
   and [Catalog](../../apps/bricks/src/components/FormInputs.stories.tsx#L120-L140).
   [Slider registry](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/slider.tsx)
4. Replace the local Select parts in
   [DropdownInput](../../apps/bricks/src/components/DropdownInput.tsx#L20-L39)
   with shadcn Base UI Select parts in `react/select.tsx`. Keep the public
   DropdownInput props, compact Field, `alignItemWithTrigger={false}`,
   4px offset, scroll arrows, placeholder, and option labels. Its current
   mounts are [Fit in Catalog](../../apps/bricks/src/components/FormInputs.stories.tsx#L140-L153)
   and [Dropdown Input Docs](../../apps/bricks/src/components/DropdownInputExample.tsx).
   [Select registry](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/select.tsx)
5. [ButtonGroupInput](../../apps/bricks/src/components/ButtonGroupInput.tsx#L25-L45)
   already uses Base UI's exclusive radio behavior. Its
   [Catalog](../../apps/bricks/src/components/FormInputs.stories.tsx#L155-L174),
   [Docs](../../apps/bricks/src/components/ButtonGroupInputExample.tsx), and
   [scripted](../../apps/bricks/src/components/Scripted/BrickInputs.stories.tsx#L112)
   callers keep the icon segments. The registry's dot indicator is a
   different visual control.

```tsx
// Preserve the Fit menu's edge alignment and gap from the trigger.
<SelectContent alignItemWithTrigger={false} sideOffset={4}>
  {/* Map the existing options to SelectItem. */}
</SelectContent>
```

## Verification

1. Run the Bricks Storybook build/import check, Bricks and App typechecks,
   and the scripted Place Search and Align and Shadow stories. Confirm
   stale results are ignored, clear works, and Enter/Escape behavior stays
   intact. Check Fit's placeholder, disabled state, and selected item.
2. The user checks Map Place, Image Upload and Fit in Storybook and live
   Bricks as applicable. Check Image Zoom's accessible name and keyboard
   increments, upload and crop Apply/Cancel, focus return, and narrow
   sidebar layouts. Record results and archive after verification.

`+` means create and `~` means modify.

```text
qrk.sh/
├── apps/bricks/src/
│   ├── modules/mapPlace/react/
│   │   └── ~ GooglePlaceLookup.tsx
│   └── components/
│       ├── + combobox.tsx
│       ├── + dialog.tsx
│       ├── + select.tsx
│       ├── + slider.tsx
│       ├── ~ DropdownInput.tsx
│       └── ~ ImageUploadInput.tsx
└── wiki/plans/
    └── ~ 072-plan-bricks-registry-editor-controls.md
```

## Implementation status

Bricks and App typechecks and the Bricks Storybook build/import check passed. Scripted Place Search and Align and Shadow passed. Headless probes selected a new Fit value and verified native image selection, the Zoom thumb's label, a 0.05 keyboard step, and local crop Apply.

## Remaining work

1. User verification. Check live Map Place and Image crop plus Fit in Storybook. Include narrow widths, placeholder and disabled states, crop Cancel, and focus return.
2. Archive after verification.
