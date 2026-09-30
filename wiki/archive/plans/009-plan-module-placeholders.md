# Optional module placeholders

Status: implemented and verified on 2026-09-29; archived after verification.

## Implementation

1. Add optional `hasPlaceholder` to `makeModuleVersion`, default false, and expose it on the module. Add `default.placeholder: () => ReactNode` to `makeModuleView` and optional `placeholder` to `IModule`. Reject either declaration mismatch at view construction. Use one placeholder across breakpoints without new named types or helper abstractions.
2. Keep payload descriptors unchanged to preserve standalone backup identity. Fix Zerospin `validatePayload` to encode null as JSON for non-nullable JSON descriptors, while retaining raw null for nullable descriptors. Mirror that targeted fix and its Core regression spec to `../zerospin`. Accept null in both guard and program state decoding for `addBrick` and `updateBrickState` only when the backend module declares `hasPlaceholder`. Preserve non-null decoding, ignored excess state properties, identity checks, error codes, and strict spec validation. Keep existing JSON storage and saved bricks unchanged.
3. On new BrickWall drops, store null when a placeholder is registered; otherwise clone the dragged state. Preserve preview data, spec, sizes, and placement. Render the placeholder for exact null before authored decoding or JSON-render execution. Allow structurally valid empty specs through the affected consumer guards for null-state placeholders.
4. Enable Image with a full-size shadcn Skeleton copied from the existing Studio implementation into Library. Leave other module registrations unchanged. Update Library's README and the brick-drop architecture document.

## Annotated examples

```tsx
// 1. Backend-safe Image declaration: permit an unconfigured brick.
hasPlaceholder: true,

// 2. Image view default: supply the required display-only markup.
placeholder() {
  return <Skeleton className="size-full" />;
},
```

```tsx
// 3. Only new drops discard preview state; spec and geometry are retained.
state: modulesHash[moduleId].placeholder !== undefined
  ? null
  : structuredClone(brickDef.state),
```

```tsx
// 4. All shared-renderer consumers see the same exact-null switch.
const Placeholder = view.default.placeholder;
if (state === null && Placeholder !== undefined) {
  return <Placeholder />;
}
```

1. **Image preview → drop:** preview retains its example image; placed brick stores null and shows the skeleton.
2. **Null → valid Image state → null:** the JSON state editor switches between content and placeholder without changing spec or placement.
3. **Non-opted-in module → null:** command rejects the update without mutation.
4. **Flag/markup mismatch:** view construction fails in either direction.

## Verification

1. Run Library `tsc` and `lint` through `pnpm nx`; run Studio typecheck and lint for its consumer change. Check affected formatting and whitespace. Never add, edit, or run Library tests. Run the focused Zerospin Core JSON-null regression spec.
2. Manually verify Image preview/drop behavior at all breakpoints, null persistence across reload, valid-state and null updates, and rejection of malformed Image state and non-opted-in null state.
3. Verify ordinary drops, existing configured Image bricks, both registration mismatches, an authored-only empty-spec placeholder, and Studio's shared-renderer placeholder.
4. Preserve unrelated WIP; record concrete blockers. Archive only after required verification is complete.

## Defaults and boundaries

1. Placeholders take no props and offer no controls or breakpoint overrides.
2. Only exact null selects a placeholder; undefined, empty strings, objects, and collections do not.
3. No new editing UI, dependencies, bulk migration, reset, or modifications to other module registrations.

## Verification results

1. **Automated checks passed:** `pnpm nx run-many -t tsc lint -p @qrk.sh/library @qrk.sh/studio`, Library build, scoped formatting, and scoped `git diff --check`. No Library tests were added, modified, or run.
2. **Core regression passed:** `pnpm nx run @zerospin/core:test -- src/contracts/validatePayload.node.spec.ts`. The regression failed before the codec fix and passed afterward. It covers JSON null, a null-or-object schema, nullable descriptors, and the string `"null"`. The fix and regression are mirrored in `../zerospin`; both remain uncommitted.
3. **Library manual checks passed:** Image previews retain example content; a new drop stores null; the Skeleton renders at 360, 720, 1080, and 1440px; null survives reload. Saving valid Image state restores content, saving null restores the placeholder, and state-only updates retain spec and geometry. `{}` is rejected with the existing missing-imageUrl error. GitHub Profile rejects null with its existing decode error, and reload confirms its previous state remains intact.
4. **Existing behavior checked:** an ordinary GitHub Profile drop retains preview content. A configured Image survives reload and an existing-brick drag without losing state. Previously saved profile bricks remain available; payload descriptors and backup identity remain unchanged.
5. **Registration and authored rendering checked manually:** both flag/markup mismatch directions throw at view construction. A temporary authored-only registration with its default empty spec selects the placeholder for null and its normal component for configured state. Consumer guards retain structural checks for empty specs, and persisted command spec validation remains unchanged.
6. **Studio manual checks passed:** dropping Image on the disposable verification page shows the Skeleton on the wall and in brick detail; both remain placeholders after reload. Screenshot: `/tmp/qrk-module-placeholder-studio.png`.
7. **Verification data:** manual runs leave a configured Image and an additional GitHub Profile in the local Library document, and an Image placeholder in Studio's existing disposable verification page. No bulk reset or migration was performed; unrelated source WIP was preserved.
