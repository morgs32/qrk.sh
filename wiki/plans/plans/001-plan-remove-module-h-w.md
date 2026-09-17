# Remove declared h/w from modules

Status: pending implementation.

Remove declared `w`/`h` from every library module except text and map-place, and
delete `measurable`. Resolved `w`/`h` presence is the only size contract.

- Both absent after breakpoint inheritance: measure unconstrained pixels and
  convert each dimension with `Math.max(1, Math.ceil(px / gridItemWidth))`.
- Both present after breakpoint inheritance: use the declared grid size; do not
  measure for gridItem or drag sizing.
- Never provide one without the other; preserve `assertBothOrNeitherWh`.
- Omitted dimensions inherit from the nearest smaller breakpoint. Omitting
  dimensions in a larger breakpoint does not clear an inherited declared size.
- Keep optional `w`/`h` on the API. Keep the intrinsic pixel and derived grid sizes
  available even when they exceed the wall width; React Grid Layout owns wall
  bounds correction.

## Implementation

1. [ ] Strip module sizes and size-only breakpoint entries.

   - `apps/library/modules/githubProfile/githubProfile.ts`: keep
     `sm: { defaultSpec }`; remove `md` and `lg`.
   - `apps/library/modules/githubRepo/githubRepo.ts`: same.
   - `apps/library/modules/githubActivity/githubActivity.ts`: same.
   - `apps/library/modules/figmaThumbnail/figmaThumbnail.ts`: keep
     `sm: { defaultSpec, options }`; remove `md` and `lg`.
   - `apps/library/modules/image/image.ts`: keep `sm: { defaultSpec, options }`;
     remove `lg`.
   - `apps/library/modules/instagram/instagram.ts`: keep `sm: { defaultSpec }`;
     remove `lg`.
   - `apps/library/modules/swatchAndIcon/swatchAndIcon.ts`: keep
     `sm: { defaultSpec, options }`; remove `w`, `h`, and `measurable`.
   - Text and map-place retain `sm: { w: 4, h: 4, defaultSpec }`; remove
     `measurable: false`. Their presentations need a containing cell.
   - Link already omits dimensions.

2. [ ] Delete `measurable` from the contract and preview consumers.

   Remove the field from breakpoint inputs, resolution, and returned values in
   `apps/library/make/defineModule.ts`, from `IModule.breakpoints` in
   `apps/library/lib/types.ts`, and from the `MODULE` constraint in
   `apps/library/make/makeFrontend.tsx`.

   In `apps/library/app/routes/modules/$moduleId/index.tsx`, replace the flag
   with `!hasDeclaredSize` for the intrinsic measurement callback and grid-unit
   labels. The intrinsic column may still report pixels for declared-size
   modules; those measurements must not drive their gridItem or drag sizing.

3. [ ] Measure before showing an intrinsically sized hidden brick.

   Update the show flow in
   `apps/library/app/routes/modules/$moduleId/$brickId.tsx` and
   `apps/library/lib/BrickStoreProvider.tsx`. For a module without resolved
   declared dimensions, measure its current presentation using the active
   breakpoint, current data, resolved spec, and breakpoint options before
   `setVisible` commits a visible placement. Feed the measured grid dimensions
   into that placement; do not expose a temporary 1×1 placement or substitute
   dimensions inherited from a different breakpoint for the measurement.

   Measurement belongs at the rendered presentation; the store consumes its
   result. Declared-size modules continue to use declared dimensions without
   measurement. Preserve the existing hide behavior.

4. [ ] Let React Grid Layout correct oversized wall placements.

   Do not introduce a separate width-clamping policy. Verify the entire drag
   and drop path, including the final stored layout. In particular,
   `apps/library/lib/BrickWall.tsx` currently copies dimensions from
   `activeBrickDrag` into the drop result; ensure the final result retains
   React Grid Layout's bounds correction rather than restoring an oversized
   width. Keep raw intrinsic and derived dimensions available in previews.

5. [ ] Update documentation.

   Update `wiki/brick-layout-conventions.md` to describe slots as
   `{ w?, h?, defaultSpec, options? }`, explain sizing after inheritance, use a
   GitHub profile example without declared dimensions, and name text/map-place
   as the modules retaining declared 4×4 dimensions.

   Remove `measurable` from the inheritance list in `apps/library/README.md`.

6. [ ] Verify without library tests.

   Run these commands from the repository root:

   ```sh
   pnpm nx run @qrk.sh/library:tsc
   pnpm nx run @qrk.sh/library:lint
   pnpm nx run @qrk.sh/library:build
   ```

   The build must precede Studio verification because Studio imports the
   library's `dist` exports.

   Manually check filmstrip, module-page previews, and the Studio brick-group
   drawer at all four breakpoints. GitHub profile, image, and swatch-and-icon
   derive sizes from measurement; text and map-place remain 4×4. Intrinsic
   grid-unit labels appear only for measured modules.

   Check GitHub Activity at `sm`, including oversized preview dimensions,
   drag placeholder, completed drop, and persisted layout. Check hide → show
   for measured and declared modules, including showing after changing data,
   spec, or options. Check drops at larger breakpoints followed by switching
   to `sm`, and confirm the resulting placement behavior.

   Preserve unrelated WIP and report unrelated check failures. Do not write
   or run library tests.

## Follow-up TODOs

1. [ ] Add Library feedback when the intrinsic pixel width exceeds the active
   breakpoint's preview width.
2. [x] Add Library feedback when the derived grid width exceeds the grid's
   eight columns, making the wall's width correction visible to the author.

These feedback items are recorded follow-ups, not part of this implementation.
