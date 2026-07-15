# QRK Zerospin grid save implementation plan

**Date:** 2026-07-12
**Status:** Implemented — archived
**Archived:** 2026-07-13
**Design spec:** `.plans/archived/2026-07-12-qrk-zerospin-grid-save-design.md`

## Goal

Set up current local `zerospin dev` for `apps/web`, authenticate the QRK owner from a verified Clerk session token, persist the page editor's entire Grid through aggregate create/update commands, expose an explicit dirty-state Save action, verify the complete local workflow, leave this plan and its design spec unarchived for user comparison, and archive both after approval.

## Requirements Trace

1. Spec user stories 1 through 3 are implemented by Nx development targets, current standalone Worker wiring, Clerk token verification, and first-auth User creation.
2. Spec user stories 4 through 9 are implemented by Zustand hydration plus aggregate Grid and GridItem contracts with browser diffing and FrontendRepo guards.
3. Spec user stories 10 and 11 are implemented by the SiteToolbar Save lifecycle and inline failure state.
4. Spec user story 12 is implemented by paused automatic push, disabled SharedWorker operation, and mounted Zerospin DevTools.
5. Spec user stories 13 and 14 are implemented by account-route session/draft isolation plus aggregate Grid revision checks in the browser and frontend guard.

## Implementation Steps

1. Initialize Nx without moving existing source files.
   1. Add `nx` as a root development dependency through pnpm.
   2. Add the minimal `nx.json` generated or required by the installed Nx version.
   3. Add explicit QRK project configuration only where inferred package-script targets cannot express continuous development or dependencies.
   4. Inspect resolved projects and targets with `nx show projects --json` and `nx show project <name> --json` before relying on target names.
2. Link the current local Zerospin package closure.
   1. Add direct `file:` dependencies to the web and domain packages with pnpm rather than hand-editing dependency declarations.
   2. Add missing root pnpm `file:` overrides for transitive Zerospin workspace dependencies.
   3. Add `@clerk/backend` directly to `@qrk.sh/zerospin` for Worker token verification.
   4. Verify the consumer package symlinks resolve to `/Users/morgs32/GitHub/zerospin` and not a registry copy.
3. Migrate QRK domain models and contracts to current Zerospin APIs.
   1. Add unique `clerkUserId` and nullable profile fields to User while retaining derived unique `actorId`.
   2. Keep Site, Page, Grid, and GridItem as explicit resources and preserve all GridItem identity and geometry fields.
   3. Change `createGrid` to accept every desired item and emit Grid plus GridItem create mutations in one command.
   4. Replace standalone `createGridItem` and `updateGridItem` browser operations with one `updateGrid` contract carrying a complete desired snapshot, explicit item intent, deleted IDs, and an expected aggregate revision.
   5. Create Grid at revision zero, advance its revision once for every real Grid or GridItem change, and emit no mutation when the complete aggregate is unchanged.
4. Migrate owner frontend and system boundaries.
   1. Replace removed surface APIs with current `makeFrontendController`, actor `frontends`, named account and actor controllers, and current `makeSystem` fields.
   2. Define the signature as one Clerk session token.
   3. Verify the token inside owner authentication, derive the User and actor IDs from verified `sub`, and create the missing User through the account finalization boundary.
   4. Add direct guards for Site/Page/Grid ownership, canonical Grid and GridItem IDs, aggregate snapshot completeness, meaningful update intent, and stale Grid revisions.
   5. Keep `createUser` account-internal rather than exposing arbitrary User creation through the browser frontend.
5. Replace the stale standalone Worker topology.
   1. Use current `ZerospinApis`, dispatch runtime, exact configured API-key resolver, and Worker-export SystemWorker resolver.
   2. Export the current twelve Durable Object classes and forward `/ws-subscriber/` requests to FrontendBlockRepo.
   3. Add `apps/web/wrangler.jsonc` with the current bindings, migrations, system alias, system identity, version, and exact local Clerk authorized party.
   4. Regenerate Worker environment types from the development Wrangler configuration.
6. Configure the complete development command through Nx.
   1. Preserve Next on `${PORT:-4000}` as `next:dev`.
   2. Add `zerospin:dev` running `zerospin dev --port ${ZEROSPIN_PORT:-4001}` from `apps/web`.
   3. Make `dev` run both continuous targets in parallel through Nx.
   4. Configure `NEXT_PUBLIC_ZEROSPIN_API_URL=http://localhost:4001` for the local browser without committing secret values.
7. Add the current browser session boundary.
   1. Add one configured `makeReactFrontend` binding for `ownerFrontend` with `isPushPaused: true`.
   2. Convert the existing site layout into the shared client boundary for Clerk, `ZerospinConfig`, an owner Provider keyed by Clerk user ID, and Zerospin DevTools.
   3. Generate the signature with `useAuth().getToken()`, fail explicitly when no token exists, and omit SharedWorker enablement.
   4. Remove the obsolete `/zerospin` page that imports removed React APIs.
8. Turn the existing Zustand grid store into the draft owner.
   1. Retain the existing `layout`, zoom fields, and direct grid edit actions.
   2. Add Clerk-user-and-page-keyed hydration, aggregate revision, dirty, saving, and inline save-error state to that same store.
   3. Mark drag, drop, create, move, and future deletion changes dirty.
   4. Hydrate from the frontend-session database only for a new page or a clean draft; never overwrite a dirty draft.
   5. Keep the seeded layout dirty when no persisted Grid exists, hide stale-route layout state until the current account-route key hydrates, and keep query or catalog failures cleared and non-interactive.
9. Implement the explicit Save flow in SiteToolbar.
   1. Read the current Site, Page, Grid, and GridItems through the owner frontend session.
   2. Compare the Zustand draft against the latest GridItem rows by stable `itemKey` and derived resource ID.
   3. Classify every current item as create, update, or none and collect persisted omissions as deletes.
   4. Decode retried Grid commands and reject a dirty draft whose captured aggregate revision differs from the actual frontend-session Grid revision unless the exact current Grid command just advanced that exact draft revision by one.
   5. Stage missing Site and Page bootstrap commands only when those resources do not exist.
   6. Stage exactly one aggregate `createGrid` or `updateGrid` command containing the complete desired snapshot.
   7. Manually push once, inspect the exact staged grid command in pending, pushed, and failed results, and show success or preserve failure state accordingly.
   8. Disable Save while clean, saving, or waiting for the exact account-route draft to hydrate, and render inline failure feedback in the toolbar.
10. Update focused verification.
    1. Replace stale workerd fixtures and bindings with the current block-repo topology.
    2. Test zero-item and many-item `createGrid` mutation output.
    3. Test one `updateGrid` command containing mixed create, changed update, unchanged none, and delete intent.
    4. Test item-only aggregate revision advancement and guard rejection for noncanonical identity, unchanged update intent, foreign item identity, incomplete authoritative snapshots, and stale Grid revisions.
    5. Test User bootstrap from verified Clerk claims with a deterministic local signing key or an injected official verifier seam already exposed by Clerk; do not bypass production authentication behavior.
    6. Add or update browser coverage for dirty Save, persisted refresh, and failure preservation when an authenticated test session is available.
11. Verify through Nx and live development readiness.
    1. Run resolved typecheck, lint, domain workerd tests, web build, and applicable Playwright targets through Nx.
    2. Start the combined continuous dev target in a long-running terminal.
    3. Wait for the actual Wrangler `Ready on http://` output and the actual Next `Ready in` output.
    4. Probe both local ports, inspect terminal failures, and stop the development process cleanly after verification.
12. Perform a requirement-by-requirement completion audit.
    1. Match every spec user story and implementation decision to current files or test output.
    2. Confirm no stale surface, fanout, websocket-subscriber, `Apis`, or `makeReactSession` symbols remain in QRK's integration.
    3. Confirm no `ALLOWED_CAST` comment or unapproved compatibility path was added.
    4. Confirm the design spec remains under `.plans/specs/` and this plan remains under `.plans/plans/`.
    5. Report the completed artifacts and code to the user for comparison before archiving either file.

## Completion Gate

1. Do not mark this plan complete merely because typecheck passes; the aggregate mutation behavior, authenticated Worker boundary, save lifecycle, and dual-server readiness must each have direct evidence.
2. Do not move the spec or plan to `.plans/archived/` during implementation.
3. Stop after presenting the finished spec, plan, code, and verification evidence. Archive only after the user has compared them and explicitly continues.

## Execution Record

1. The implementation scope is complete.
   1. Nx resolves `@qrk.sh/web` and `@qrk.sh/zerospin`; the web project exposes continuous `next:dev` and `zerospin:dev` targets plus the combined `dev` target.
   2. Local Zerospin dependencies remain `file:` links. React and React DOM are aligned on 19.2.7 so the linked domain and React packages share one `@zerospin/core` type context.
   3. Wrangler is pinned to 4.90.0 in `apps/web` because that is the latest verified bin-path contract accepted by the current local `zerospin dev` CLI.
   4. QRK runs as system version 2.0.0 with the current twelve Durable Object bindings, standalone dispatch Worker, exact publishable/secret API-key validation, and FrontendBlockRepo websocket forwarding.
   5. Owner authentication verifies the Clerk token, derives the actor from verified `sub`, persists `clerkUserId`, and creates a missing User before returning the actor/account identity.
   6. `createGrid` emits Grid revision zero plus every GridItem mutation from one command. `updateGrid` carries the full desired snapshot, emits only declared GridItem create/change/delete mutations, and advances Grid revision once for any real aggregate change.
   7. Grid and GridItem guards enforce the canonical IDs derived from Page and stable item key, closing alternate-ID one-to-one races.
   8. The site editor keys both the Provider and Zustand draft by Clerk user, gates rendering and Save on the exact hydrated account-route key, treats the seed as a dirty first draft, mounts paused DevTools without SharedWorker, and exposes inline failure feedback.
   9. Save decodes and retries existing staged Grid commands before diffing, grants a revision exception only to the exact current Grid and exact expected transition, reads the actual session database at the click boundary, preserves failed and in-flight edits, and scopes asynchronous completion to the initiating account-route key.
2. Final verification passed.
   1. `nx show projects --json` returned `@qrk.sh/zerospin` and `@qrk.sh/web`.
   2. `nx run @qrk.sh/web:typecheck --skipNxCache` passed.
   3. `nx run @qrk.sh/web:lint --skipNxCache` and `nx run @qrk.sh/zerospin:lint --skipNxCache` passed with no errors.
   4. `nx run @qrk.sh/zerospin:test:workerd --skipNxCache` passed one file and six tests covering aggregate create/update output, item-only revision advancement, unchanged omission, and real-database guard failures for noncanonical identity, false intent, foreign identity, incomplete snapshots, and stale revisions.
   5. `nx run @qrk.sh/zerospin:types --skipNxCache` regenerated the Worker types for system version 2.0.0.
   6. `nx run @qrk.sh/web:build --skipNxCache` completed the production Next build and TypeScript pass.
   7. `nx run @qrk.sh/web:dev` produced Next `Ready in` on port 4000 and Wrangler `Ready on http://localhost:4001`; HTTP probes returned 200 from Next and the expected Cap'n Web 400 response to a plain GET on the Zerospin RPC port.
   8. A live Cap'n Web call with an invalid dispatch key returned encoded `qrk-api-key-invalid` status 401, and both development processes were then stopped cleanly.
   9. `git diff --check` passed; no stale removed integration symbols, new `ALLOWED_CAST`, or new `as const` additions remain in the change.
   10. Independent backend and UI/session re-reviews reported no remaining actionable findings after the correction pass.
3. Authentication automation was intentionally not weakened.
   1. The ignored local environment supplies Clerk and Zerospin keys but no Clerk end-to-end user credentials.
   2. The existing Playwright page tests are anonymous and would now stop at the required Clerk boundary, so they were not represented as authenticated persistence evidence.
   3. No verifier injection helper, test-only authentication bypass, or alternate production path was added merely to automate Clerk bootstrap or a full FrontendRepo push.
4. The user completed the comparison checkpoint and approved archiving the design spec and this plan on 2026-07-13.
