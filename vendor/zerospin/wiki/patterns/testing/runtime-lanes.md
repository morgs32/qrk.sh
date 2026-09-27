# Zerospin test runtime lanes

Use the shared focused-versus-behavioral organization convention. Zerospin's
profile preserves the actual runner boundary before changing a filename.

1. Core and schema Node discovery uses `*.node.spec.ts`. Colocated specs match
   their source basename; command-journal workflows live under `session/tests/`.
2. Worker tests use `*.workerd.spec.ts` and their workerd configuration. Do not
   mix them into a Node project or replace their real runtime with a fake.
3. React DOM tests use `*.react.spec.tsx` in their configured DOM/browser project.
   Real Chromium integration uses `*.playwright.spec.ts` or `.tsx` and its
   Playwright/Vitest browser configuration.
4. `*.typecheck.ts` and `.tsx` belong to the configured typecheck lane and stay
   out of production emission.
5. CLI, error, logger, live-query, and DevTools also have existing generic
   `*.spec.ts` discovery. A generic suffix in a single-runtime configuration is
   not evidence of a wrong runtime. Inspect the actual configuration before
   renaming; keep logger's workerd exclusion intact.
6. Build an old-test-to-invariant-to-new-test map before moves. Preserve test
   names and bodies where behavior is unchanged; enumerate deliberate added
   cases separately. Compare collection and run the affected Nx targets.
7. Keep failure, resume, cancellation, identity, ordering, and exact-Cause
   assertions. Use `Deferred` for ordering proof, not sleeps. Chromium polling
   for a real lifecycle or DOM state remains a readiness assertion.
8. Review findings are numbered and actionable. Restructure one invariant at a
   time within the requested scope; do not restore tests for superseded APIs.
