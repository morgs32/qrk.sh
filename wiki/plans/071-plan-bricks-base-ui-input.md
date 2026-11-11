# Plan 071 — Adopt shadcn Base UI Input in Bricks

Use shadcn's Base UI Input at the existing Bricks export. Preserve the compact
28px field surface, slots, autofill policy, native file control, and callers'
control of value and validation. [Adoption audit](../research/shadcn-component-adoption-audit.md#bricks) · [Registry Input](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/input.tsx)

## Implementation and call sites

1. In [Input](../../apps/bricks/src/components/Input.tsx#L5), render the registry's
   Base UI Input primitive with the current compact classes and string
   className support. Keep the existing `type`, prop forwarding, `data-slot`,
   and override order for `autoComplete` and `data-1p-ignore`. Forward the
   ref to the visible input. Keep the existing package export.
2. Check both [TextInput branches](../../apps/bricks/src/components/TextInput.tsx#L40-L58)
   and [InputGroupInput](../../apps/bricks/src/components/input-group.tsx#L24-L35).
   Keep the grouped slot on the actual input so the outer focus and invalid
   rings work. The input is also the render target of
   [NumberField.Input](../../apps/bricks/src/components/NumberInput.tsx#L62) and
   [Combobox.Input](../../apps/bricks/src/modules/mapPlace/react/GooglePlaceLookup.tsx#L199-L205).
   Those primitives continue to own their value, focus and ARIA behavior.
3. Verify the other group callers at
   [Color](../../apps/bricks/src/components/ColorInput.tsx#L49),
   [Shadow](../../apps/bricks/src/components/ShadowInput.tsx#L40), and
   [Buttons Docs](../../apps/bricks/src/components/ButtonExamples.tsx#L46).
   Verify direct calls at [spec generation](../../apps/bricks/.storybook/BrickStory.tsx#L198)
   and [Studio Sidebar story](../../apps/bricks/src/components/StudioSidebar.stories.tsx#L27).
   All these sites keep their existing API.
4. Exercise the inherited live TextInput sites for
   [Figma](../../apps/bricks/src/modules/figmaThumbnail/react/FigmaThumbnailForm.tsx#L97),
   [Instagram](../../apps/bricks/src/modules/instagram/react/InstagramForm.tsx#L99),
   [Image title](../../apps/bricks/src/modules/image/react/ImageForm.tsx#L85),
   [Image file and URL](../../apps/bricks/src/components/ImageUploadInput.tsx#L174-L216),
   [GitHub Activity](../../apps/bricks/src/modules/githubActivity/react/GitHubActivityForm.tsx#L107),
   [GitHub Repo](../../apps/bricks/src/modules/githubRepo/react/GitHubRepoForm.tsx#L94),
   [GitHub Profile](../../apps/bricks/src/modules/githubProfile/react/GitHubProfileForm.tsx#L99),
   [Link](../../apps/bricks/src/modules/link/react/LinkForm.tsx#L86), and
   [icon search](../../apps/bricks/src/modules/swatchAndIcon/react/MaterialSymbolsIconLookup.tsx#L76).
   Keep their save and lookup behavior.

```tsx
// NumberField supplies numeric interaction and receives the visible input ref.
<NumberField.Input render={<InputGroupInput />} />
```

## Verification

1. Build Bricks Storybook through Nx, typecheck Bricks and App, and run the
   scripted Place Search, Align and Shadow, and Link form stories. Confirm
   there is one visible labeled input per field, with stable description
   and error associations, and that native file selection still works.
2. The user checks label focus, plain and grouped focus rings, file
   selection, and numeric and combobox keyboard behavior. Record results
   here and archive after verification. The change uses existing terms.

`~` means modify.

```text
qrk.sh/
├── apps/bricks/src/components/
│   └── ~ Input.tsx
└── wiki/plans/
    └── ~ 071-plan-bricks-base-ui-input.md
```

## Implementation status

Bricks and App typechecks and the Bricks Storybook build/import check passed. Scripted Place Search, Align and Shadow, and Link autosave passed. A headless browser probe verified numeric keyboard stepping, native file selection, and the local image crop Apply path.

## Remaining work

1. User verification. Check plain and grouped focus rings, text and file fields, label focus, and keyboard behavior in NumberField and Map Place.
2. Archive after verification.
