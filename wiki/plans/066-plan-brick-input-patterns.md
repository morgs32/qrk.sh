# Plan 066 — Standardize Brick inputs on shadcn Base UI

Use shadcn’s Base UI components where they match the interaction. Keep the
compact Studio controls, existing field orientations, and Brick-owned validation,
provider lookups, and autosave. Build on [Plan 065](./065-plan-brick-form-autosave.md)
and the [input audit](../research/shadcn-brick-input-pattern-audit.md) and
[focus audit](../research/shadcn-input-group-focus.md).

## Implementation

1. Adapt the shadcn Base UI Input Group parts in Bricks. Use the shared wrapper,
   control, addon, and button styles where a field has integrated adornments.
   Place the input first in DOM order and align start and end addons visually.
   Migrate the Figma link icon, lookup search icons and Map Place clear button,
   and integrated swatches. Leave separately rendered clear and editor buttons
   as separate actions. Plain text and file fields keep the standard input.
2. Put the focus-visible and invalid rings on the integrated control surface.
   Draw the group focus ring only when its input has visible focus, suppress the
   nested input ring, and keep an independent focus indicator for tabbable
   actions. Decorative icons stay out of the Tab order. Use the same surface
   styles on the existing Base UI `NumberField.Group` so the ring covers the
   icon, input, steppers, and any integrated trailing action. Preserve native
   Number Field keyboard stepping and keep the steppers out of the Tab order.
3. Move Map Place to shadcn’s Base UI Combobox. Use a controlled search string
   and place ID, stable option identity, and provider-filtered results. Preserve
   debounce, abort and stale-response guards, selected-place hydration, Google
   attribution, and local status and errors. Choosing a result runs the
   existing details lookup and autosave. Typing or clearing search changes the
   draft only. Let Combobox own popup navigation, active option announcements,
   and selection events.
4. Keep Material Symbols’ persistent paginated grid. Render each result as a
   named shadcn button in a named group and expose the current icon with
   `aria-current`. Keep the selected indicator, Tab and Enter/Space interaction,
   Load more, and immediate selection save.
5. Use shadcn Radio Group for Align. Preserve the icon segments, option labels,
   disabled state, and empty initial value. Use the radio primitive’s exclusive
   selection and arrow-key behavior. Put Fit on the shadcn Base UI Select
   composition with the same trigger-edge alignment, options, and value handling.
6. Use shadcn Slider for Image Zoom. Keep its accessible name, min 1, max 20,
   step 0.05, disabled state, and live crop draft updates. Preserve the Image
   dialog’s upload, URL, pan, and Apply/Cancel flow. Reuse shadcn Popover parts for
   the swatch and radius editor shells while keeping the hex picker, width,
   shorthand, and per-corner editing. Keep Position and Size as named groups of
   numeric fields.
7. Give Shadow shorthand an associated FieldError and invalid state when a
   commit rejects malformed input. Keep the typed draft and last accepted shadow.
   Clear the error on edit or reset. Use existing Field and FieldGroup layout
   for the changed controls so labels and feedback retain their placement.
8. Use the existing Field and FieldLabel for NumberInput's label layout. Render
   Base UI NumberField.Root through Field and NumberField.Group through InputGroup.
   Keep stacked labels in the catalog and vertically centered inline labels in
   the property editors. Keep prefix-only Position and Size controls full-width
   and individually named. Base UI continues to handle numeric editing and
   stepping. [Brick input audit](../research/shadcn-brick-input-pattern-audit.md#figma-link-and-row-width)

```tsx
// The icon is first visually. The input remains first in DOM order.
<InputGroup>
  <InputGroupInput id={inputId} />
  <InputGroupAddon align="inline-start">{/* Decorative icon */}</InputGroupAddon>
  <InputGroupAddon align="inline-end">{/* Tabbable action, if present */}</InputGroupAddon>
</InputGroup>
```

```tsx
// Row width shares the field layout and input surface with Figma Link.
<NumberField.Root id={id} render={<Field orientation="vertical" />}>
  <FieldLabel htmlFor={id} className="min-h-0">Row width</FieldLabel>
  {/* Base UI retains the numeric interaction on the shared surface. */}
  <NumberField.Group render={<InputGroup />}>
    <NumberField.Input render={<InputGroupInput />} />
    {/* Leading icon and Base UI steppers go inside the group. */}
  </NumberField.Group>
</NumberField.Root>
```

## Verification

1. Run the Bricks Storybook build and App and Bricks typechecks.
2. Use existing scripted Storybook seams with mocked providers. Cover Map Place
   arrow navigation and active option, Enter selection, Escape, clear, and stale
   response handling. Check icon activation and selection announcement, exclusive
   Align keyboard selection, and Shadow invalid-to-valid correction.
3. Manually tab through the catalog and relevant Brick stories. Check that the
   number group ring encloses the icon and steppers, that integrated action
   buttons show individual focus, and that Fit, Image Zoom, swatches, and Radius
   retain their interactions. Confirm Figma’s stacked label and help/error
   placement and Map Place’s selection autosave.
4. Update the module documentation and reconcile terminology if needed. Archive
   after the automated and manual checks pass.

## Scope decisions

1. Adapt the registry parts in Bricks using its existing Base UI dependency and
   styling tokens. Keep provider requests, save callbacks, and Brick models in
   their current owners.
2. This plan covers the Form Inputs catalog and Brick sidebar controls, including
   the Image crop dialog. Article’s inline editor and Storybook’s spec tools
   remain outside this scope.

## Remaining work

The Bricks Storybook build and import check passed, as did App and Bricks
typechecks. The scripted Map Place, Material Symbols, Align and Shadow, and Link
autosave stories passed in jsdom. The Storybook build includes the group
focus-visible selector.

After the NumberInput layout change, the Nx Bricks Storybook build and its import
check passed. App and Bricks typechecks and `git diff --check` passed.

1. The user will verify the rendered focus rings, addon focus, and picker and
   crop interactions in Storybook.
2. In Form Inputs Catalog, click Row width's label and confirm it focuses the
   input. Check that keyboard focus encloses the icon, input, and steppers.
   Verify Arrow Up and Down, stepper clicks, and the minimum of zero. Compare
   the stacked label with Figma Link, and check the paired Position and Size
   controls and the inline Border, Radius, and Shadow controls.
3. Archive after manual verification passes.
