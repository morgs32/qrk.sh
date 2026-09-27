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
4. CLI, error, logger, live-query, and DevTools also have existing generic
   `*.spec.ts` discovery. A generic suffix in a single-runtime configuration is
   not evidence of a wrong runtime. Inspect the actual configuration before
   renaming; keep logger's workerd exclusion intact.
5. Keep source scans and other non-behavioral guards in an Nx `static:check`
   target. Put tests that launch real external runtimes such as Wrangler in a
   separate `test:integration` target and run both targets in CI.
6. Build an old-test-to-invariant-to-new-test map before moves. Preserve test
   names and bodies where behavior is unchanged; enumerate deliberate added
   cases separately. Compare collection and run the affected Nx targets.
7. Keep failure, resume, cancellation, identity, ordering, and exact-Cause
   assertions. Use `Deferred` for ordering proof, not sleeps. Chromium polling
   for a real lifecycle or DOM state remains a readiness assertion.
8. Review findings are numbered and actionable. Restructure one invariant at a
   time within the requested scope; do not restore tests for superseded APIs.

## Behavioral coverage

1. Test a public contract through inputs, outputs, errors, and observable state.
   A source file does not require a separate test when its behavior is already
   covered through its owning contract. Avoid asserting incidental internal
   calls or ordering across independent consumers.
2. Use input tables for repeated examples. Retain separate failure, cancellation,
   retry, and recovery cases when they protect distinct promises.
3. Keep pure logic in Node and component behavior in jsdom. A pure spec inside a
   jsdom-default package can select Node with `// @vitest-environment node`.
   Use workerd for Durable Object semantics and Chromium for real browser
   storage, worker death, page freezing, offline recovery, and emitted assets.
4. Run shared scenarios through separate runtime configurations when only the
   endpoint changes. Sync's local and platform browser configurations share one
   spec; unique Agent identities isolate each execution.
5. Remove a test only after identifying its surviving coverage or the obsolete
   contract. Consolidating source alone does not reduce the number of executed
   scenarios. Measure Nx task time separately from test-body time.
