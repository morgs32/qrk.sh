# Library wall contracts implementation

**Date:** 2026-09-17
**Status:** Pending implementation
**Source:** [Approved design](../specs/archive/002-spec-library-wall-contracts.md)

Implement the library sandbox's Wall → Brick → Placement model through Zerospin
contracts and `makeMockProvider`. Ship the complete interaction cutover together;
the steps below are implementation order, not independently shippable partial work.

## Current code and scope

`apps/library/aggregates/library/libraryAggregateV1.ts` already registers ten
module models and their typed state-update contracts. `makeModuleModelVersion`
currently puts `state` and four spec columns on each module row.

`apps/library/lib/BrickStoreProvider.tsx` separately owns committed wall data in
Zustand. `BrickWall.tsx` automatically compacts, writes layouts, creates bricks,
and directly deletes store entries. The brick detail route writes specs and
visibility through the store. `app/Layout.tsx` loads and saves sandbox bricks in
localStorage and resets them with a direct store write.

Studio imports the exported `BrickWall` and `GridStore` and is explicitly outside
this migration. Preserve those exports, their argument shapes, and Studio's
existing behavior. Use an app-local sandbox wall for the contract-backed path;
do not require Studio to mount the sandbox mock provider. Retain shared legacy
store code while Studio still consumes it. This is a scoped consumer boundary,
not a new storage-adapter framework.

The worktree already contains viewport and wall WIP. Implement against that
state without restoring deleted providers or replacing current measurement
wiring. The `docs/` paths referenced by AGENTS.md are absent at planning time;
use the available wiki guidance and check for restored guidance before coding.

## Implementation

1. [ ] Establish the wall and placement resource shapes in the library aggregate.

   Add model definitions beside the existing aggregate/module definitions:

   - Wall: a normal Zerospin resource representing a collection of bricks.
   - Membership: wall reference, module identity, and reference to its typed
     module row. Keep shared state on that module row, not on membership.
   - Placement: membership/brick reference, breakpoint (`sm`, `md`, `lg`, `xl`),
     complete spec, grid item, and visibility. Enforce uniqueness of brick plus
     breakpoint and require four placements on creation.

   Register these models and their selections in `libraryAggregateV1.ts`.
   Use Zerospin resource IDs and references consistently; the grid item's `i`
   must map unambiguously to the same brick across all four placements. Keep
   all resources in the same aggregate and validate wall ownership on commands.

   Update `makeModuleModelVersion.ts` so module rows retain their typed shared
   state and no longer carry `sm`/`md`/`lg`/`xl` spec columns. Preserve the
   existing component-derived spec validation when moving storage: placement
   writes must decode the full document against the owning module's schema.
   Do not replace it with unchecked generic JSON. Cover all ten registered
   modules, including authored presentations.

   Before adding named TypeScript aliases or helper abstractions, follow the
   repository's explicit approval requirement with the exact shape and callers.
   This plan does not authorize assertion markers, generic registries, or new
   factory layers. Inline single-use shapes and use existing model/contract APIs.

2. [ ] Implement layout behavior using the installed React Grid Layout core.

   Use exports from `react-grid-layout/core` for command-side bounds and collision
   work; inspect the installed 2.2.3 signatures and mutation behavior before use.
   Clone committed grid items before passing them to mutating algorithms.
   Keep the existing eight columns and `lib/breakpoints.ts` measurements.

   Disable automatic compaction in the sandbox grid while retaining collision
   resolution. Inserting or showing a placement must displace overlapping visible
   neighbors around its saved/copied position without closing unrelated gaps.
   A no-compaction setting alone is not proof that collisions are resolved.
   Hidden placements do not participate in collisions or compaction.

   Preserve the active drop's already resolved layout, including width/bounds
   corrections. At the other three breakpoints, start with that same dropped
   item and resolve against each breakpoint's own visible layout. Do not copy
   the active breakpoint's neighbor positions into other breakpoints.

3. [ ] Add the aggregate commands and complete their validation and mutations.

   Register commands with the full set of models they read/mutate in
   `libraryAggregateV1.ts`. Follow existing named Effect programs and mutation
   APIs. Use the normal transactional command executor; do not add transaction
   infrastructure, separate sequential create commands, or compensating writes.

   | Command | Input and behavior |
   | --- | --- |
   | `addBrick` | Wall, module identity, new brick identity, typed state/spec input, active breakpoint, dropped item, and resolved active layout. Validate the module-specific state and spec; clone them; create membership, the module row, and four visible placements; include all displaced neighbors in the same command. |
   | `updateLayoutAtBreakpoint` | Wall, breakpoint, and resolved layout items for existing placements. Validate ownership and item identities, duplicates, bounds, and visible overlap. Update only grid items; never create/delete placements or alter state, specs, or visibility. |
   | Existing module state commands | Preserve their typed payloads and shared-state semantics. Edits update the one module row observed by every placement. |
   | Module-specific spec-at-breakpoint commands | Brick identity, breakpoint, and complete module-validated spec. Update only that placement's spec, including when hidden. Follow the existing per-module state-contract organization. |
   | `setBrickVisibilityAtBreakpoint` | Brick, breakpoint, and visibility. Hiding changes visibility only. Showing resolves visible collisions around the saved position and commits visibility plus all displaced grid items together. An unchanged visibility value must not move neighbors. |
   | `removeBrick` | Brick identity scoped to its wall. Delete its membership, typed module row, and all four placements in one command. Do not move any neighbor. |
   | `compactLayoutAtBreakpoint` | Wall and breakpoint. Apply vertical compaction to visible placements only; change only those grid items. |

   Reject unknown modules/resources, invalid specs/state, mismatched ownership,
   and invalid layout references before any partial result can become visible.
   Keep input validation at existing contract boundaries. Do not trust a route's
   module ID to select a different schema from the persisted brick's owner.

4. [ ] Assemble the library frontend and seed one mock sandbox session.

   Add library-local aggregate frontend composition using the existing aggregate,
   all of its model bindings, and all contracts above. Keep this distinct from
   `make/makeFrontend.tsx`, which renders individual module presentations.

   Follow `vendor/zerospin/packages/react/src/mock.typecheck.ts` and `mock.ts`
   for `makeZerospinApp`, frontend binding, `makeMockProvider`, service layers,
   authentication, and decoded resource fixtures. Supply an `acct_` aggregate
   ID accepted by the current mock provider and seed one empty sandbox wall.
   Register models consistently in the aggregate and frontend.

   Add the direct `@zerospin/react` workspace dependency required by this
   integration using the repository's package-link workflow. Reuse the shipped
   mock runtime and its WASM setup; do not create production transport, worker,
   remote persistence, or another mock execution path. Vendor files stay read-only.

   Mount the provider above both wall and editors in `app/Layout.tsx`; keep its
   identity stable across drawer navigation and breakpoint changes. A fresh mount
   starts from the seed. Remove sandbox brick hydration, subscriptions, and writes
   to localStorage. Existing viewport preference behavior may remain independently;
   do not read old bricks into the new model or delete unrelated localStorage.

5. [ ] Replace sandbox store reads and mutations throughout the interaction path.

   Add the app-local sandbox wall at `apps/library/app/LibraryWall.tsx`, using
   the existing wall markup/interaction behavior as the starting point. Wire it
   from `Layout.tsx` without changing the Studio-facing `BrickWall` props.
   Read membership, typed module state, and active placements through the
   frontend's reactive model-query API. Render only visible placements.

   Map drop to one `addBrick` command. Map completed move/resize interactions to
   `updateLayoutAtBreakpoint` with their collision-resolved layouts. Do not send
   programmatic layout notifications back as new commands on each reactive render.
   Dragging outside submits `removeBrick` and leaves gaps at every breakpoint.

   Update `app/routes/modules/$moduleId/$brickId.tsx` to read the selected brick
   and placement reactively. Route shared-state editing through the owning
   module's state contract; wire an editor if the current route does not expose
   one. Route generated/manual spec results through its spec-at-breakpoint
   command, and hide/show through the visibility command. Retain generation and
   form drafts locally until a command succeeds. Capture the targeted brick and
   breakpoint when an asynchronous spec edit starts so navigation cannot retarget it.

   Audit the filmstrip, `app/DraggableBrick.tsx`, module previews, and remaining
   sandbox store callers. Keep drag payloads, outside-drop indication, selection,
   dimensions, and viewport state local; remove committed brick/layout ownership
   from the sandbox's Zustand path. Do not delete Studio's remaining store users.

   Surface command/init failures in the owning UI and render the previously
   committed resources after rejection. Never fall back to `setState` or local
   committed copies. Preserve not-found handling when an open brick is removed.

6. [ ] Wire the toolbar and reset without bypassing contracts.

   Add the visible “Compact layout” button to the existing grid toolbar and
   dispatch `compactLayoutAtBreakpoint` for the active breakpoint only.
   Keep the existing reset control: remount the sandbox provider with its initial
   empty-wall seed and clear transient selection/drag state. This is a new mock
   session, not an extra reset contract or a direct model/store mutation. Ensure
   old asynchronous work cannot target the replacement session.

7. [ ] Update affected documentation to match the completed implementation.

   Update `wiki/brick-layout-conventions.md`,
   `wiki/architecture/browser/LibrarySandboxBrickDrop.md`, and the affected
   sections of `apps/library/README.md` and `wiki/architecture/BrickModule.md`.
   Describe state on module rows, complete specs on placements, four-placement
   atomic creation, collision resolution without automatic compaction, explicit
   compaction, and fresh mock sessions. Correct obsolete sandbox source links and
   diagrams using the implementation's actual paths. Distinguish the sandbox
   behavior from Studio's deferred integration; do not rewrite Studio's workflow
   as though it has migrated. Plan 001 is separate and is not revived here.

8. [ ] Verify the entire behavior before marking this plan complete.

   Run the confirmed library targets from the repository root:

   ```sh
   pnpm nx run @qrk.sh/library:tsc
   pnpm nx run @qrk.sh/library:lint
   ```

   Do not add, run, restore, or maintain library automated tests. Start the
   sandbox through its existing dev target when needed and wait for its actual
   ready output before manual verification. Record results for each case:

   | Manual scenario | Required result |
   | --- | --- |
   | Fresh mount, navigation, refresh | One seeded wall; navigation preserves the mounted session; refresh starts empty without restoring old localStorage bricks. |
   | Drop at each of four breakpoints with distinct neighbor layouts and deliberate gaps | One module row, one membership, exactly four visible placements; no overlaps; unrelated gaps survive; active drop position and bounds corrections survive. |
   | Move and resize into occupied cells | Resolved visible layouts commit; unrelated gaps survive; other breakpoints/specs/state are unchanged. |
   | Hide, then show into a now-occupied saved position | Hide moves nobody; show displaces collisions atomically; saved hidden spec and grid item survive until showing. |
   | Shared state edit and per-placement spec edit | State appears across breakpoints; only the selected placement's spec changes; exercise different module schemas and reject an invalid document. |
   | Drag outside | Membership, module row, and all four placements disappear together; gaps remain at every breakpoint. |
   | Explicit compact with hidden placements | Only visible placements at the active breakpoint compact; hidden placements and other breakpoints remain unchanged. |
   | Rejected creation/layout/spec command | Visible error and unchanged committed resources; no orphan or partial rows. Inspect reactive resource reads as well as the rendered wall. |
   | Reset and removal while detail/generation is open | No stale selection, wrong-target write, or resurrected brick; reset returns to the empty seed. |
   | Studio boundary | Existing shared exports and call shapes remain valid; no Studio source migration or mock-provider requirement. |

   Review the final scoped diff and report unrelated check failures rather than
   fixing them. Mark steps complete only with evidence; archive this plan only
   after implementation and verification are complete.

## Exclusions

No Site/Page integration, Studio migration, remote persistence, breakpoint
inheritance, propagation of spec edits, replacement mock runtime, new transaction
infrastructure, or unrelated cleanup.
