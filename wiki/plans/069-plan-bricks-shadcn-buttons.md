# Plan 069 — Adopt shadcn Base UI buttons in Bricks

Replace the Bricks `Button` and `InputGroupButton` implementations with the
shadcn Base UI registry versions using Nova button styles and QRK's existing
theme colors. Ordinary buttons take on Nova's appearance. Keep the 24px
input actions and preserve the local geometry of compact editor controls,
steppers, icon tiles, and the Wall drag handle.

## Implementation

1. Use shadcn's Base UI `Button` in the existing `button.tsx` module. Use
   the registry's six variants and eight sizes with the Nova Tailwind
   utilities in the CVA definitions so the existing `cn` merge still handles
   caller overrides. Keep the existing string `className` surface and use
   Base UI's `render`, `nativeButton`, and disabled behavior. Remove
   `asChild` after confirming it still has no callers. Keep the existing
   Bricks package export and existing dependencies. [Base UI registry](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/button.tsx) · [Nova button styles](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/styles/style-nova.css#L134-L187)
2. Replace only the button part of the existing `input-group.tsx` with
   shadcn's `InputGroupButton`, including its distinct `xs`, `sm`,
   `icon-xs`, and `icon-sm` sizes and its `type="button"`, ghost, and
   `xs` defaults. Apply the Nova input-group button utilities. Supply the
   App's existing radius token value in the Bricks Storybook theme for
   styles that read `--radius`. Keep the existing input group layout,
   addons, and focus ring. [Input Group registry](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/input-group.tsx#L61-L95) · [Nova input-group button styles](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/styles/style-nova.css#L1283-L1296)
3. Plan 068 relocated the Bricks sources during this cutover. The changes
   carried forward into the new locations, including the existing NumberInput
   and InputGroup work. Scope the change
   to the Bricks implementation and its existing consumers.

## Call sites

1. **Change three calls.** Add `size="icon-xs"` to the
   [Map Place clear button](../../apps/bricks/src/modules/mapPlace/react/GooglePlaceLookup.tsx#L215),
   [swatch popover trigger](../../apps/bricks/src/components/SwatchPopover.tsx#L15),
   and [Buttons Docs clear example](../../apps/bricks/src/components/ButtonExamples.tsx#L53).
   Keep their labels, events, and render composition.
2. **Keep the current Button props and check the dimensions.** NumberInput
   composes both steppers with Base UI NumberField and sets their height and
   width. RadiusInput composes a Base UI popover trigger. RadiusInput,
   ColorInput, BorderInput, and ShadowInput set their own 28px icon button
   dimensions. MaterialSymbolsIconLookup sets square icon tile geometry.
   App's WallPlacement sets drag-handle size, padding, and cursor. Keep those
   overrides and add the matching Nova active-translation override to the
   WallPlacement handle so pressing it stays in place.
3. **Keep the current Button props on the remaining calls.** ImageUploadInput,
   ArticleEditor, the Buttons example's regular buttons, and the App Wall
   Editor stories use supported variants and sizes. BrickStory's Generate
   button already sets `type="submit"`. Its Cancel and Reset buttons
   already set `type="button"`. MaterialSymbolsIconLookup's Load more
   button already sets `type="button"`. Check the App stories because
   they import the same Bricks export.

```tsx
// Use the registry size for the existing 24px icon-only clear action.
<InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setQuery("")}>
  <X aria-hidden className="size-3.5" />
</InputGroupButton>
```

## Verification

1. Run the Bricks Nx Storybook build and import check, Bricks and App
   typechecks, the App Storybook build, and `git diff --check`. Run the existing
   scripted Place Search, Icon Selection, and Align and Shadow stories.
2. Check form semantics with a small render or interaction probe. A plain
   Button inside a form defaults to an ordinary action, explicit submit
   still submits, and the compact input action renders as a 24px ghost
   button with its accessible name.
3. The user checks the Buttons Docs and Catalog, mouse and keyboard stepping,
   swatch and radius popovers, image crop actions, and the App Wall drag
   handle. Verify focus, disabled styling, and the retained compact sizes.
4. Record verification results and archive the plan after the required checks
   pass. The change uses existing terminology and does not warrant an ADR.

`+` means create and `~` means modify.

```text
qrk.sh/
├── apps/
│   ├── app/components/WallEditor/
│   │   └── ~ WallPlacement.tsx
│   └── bricks/
│       ├── .storybook/
│       │   └── ~ preview.css
│       └── src/
│           ├── modules/mapPlace/react/
│           │   └── ~ GooglePlaceLookup.tsx
│           └── components/
│               ├── ~ button.tsx
│               ├── ~ input-group.tsx
│               ├── ~ SwatchPopover.tsx
│               └── ~ ButtonExamples.tsx
└── wiki/plans/
    └── + 069-plan-bricks-shadcn-buttons.md
```

## Implementation status

Bricks and App Storybook builds, Bricks import check, and both typechecks passed. The default/native submit-type render probe and the clear action's 24px size and behavior passed. Scripted Place Search, Icon Selection, and Align and Shadow passed.

## Remaining work

1. User verification. Check Buttons Docs and Catalog, keyboard and pointer steppers, popover triggers, image actions, and the Wall drag handle. Confirm focus, disabled styling, and compact dimensions.
2. Archive after verification.
