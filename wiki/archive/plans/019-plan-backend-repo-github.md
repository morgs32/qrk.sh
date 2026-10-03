# 019 — Standalone BackendRepo and GitHub APIs

**Date:** 2026-10-03  
**Status:** Implemented, verified, and archived.

## Agreed decisions

1. Start provider consolidation with GitHub. A single storage-only `BackendRepo`
   uses Zerospin's `makeMigratableDORepo`; other provider Backends keep their current
   behavior. Instagram's `BrowserHost` remains browser infrastructure.
2. Expose `LibraryApi.getGitHubProfile(url)` and `getGitHubRepo(url)` directly.
   Module-owned Effect programs normalize URLs, fetch upstream, validate, and
   orchestrate retention. Preserve the profile fields and contributions and the
   repository's five-field payload. Keep credentials on the server.
3. Every request fetches upstream. Await best-effort retention after success;
   envelope failures and transport rejections are logged without replacing fetched
   data with an error. Upstream failures leave retained responses untouched. No
   stored response is served as a cache hit; no TTL, timestamp or background fetch.
4. Store generic JSON responses with distinct provider/request keys and one
   synchronous upsert. The last successful write wins, including overlapping
   upstream attempts. The repo owns JSON validation and storage, not providers.
5. Common `makeDORepo` accepts optional inline `validateKey({ key })` and
   `registerRepo({ name, schema })` hooks. Fixed repos supply system validation and
   admission; migratable repos supply neither. Validate before database config,
   register before storage access, and preserve the SystemRepo exemption and the
   registration error union `IAnyError | IZerospinErrorJson`.
6. Remove unused common/migratable `repoType`; fixed config retains it. Import
   factories through their defining package paths. Mirror scoped changes to the
   sibling Zerospin checkout, preserving unrelated work.
7. `makeMigratableDORepoConfig` already accepts `abbreviation?: string | null`,
   with `abbreviation = null` in the first props destructuring. Omission/null means
   no prefix; supplied abbreviations preserve their existing behavior.
8. Reset only API's affected local Wrangler baseline to `v1`, replacing
   GitHubBackend with BackendRepo. Do not copy old GitHub cache entries or alter
   other migration lists. Preserve R2 assets and unrelated project state. Tags are
   applied once per environment; rewriting local config does not reset a deployed
   namespace ([Cloudflare reference](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/#migration-wrangler-configuration)).
9. GitHub UI, module machines, deployment, commits and publishing are outside this
   phase. Leave obsolete Library test infrastructure alone; never run Library tests.

## Implementation

1. **Implemented:** optional abbreviation and shared naming behavior, with source
   and documentation mirrored locally to `../zerospin`.
2. **Implemented:** standalone common factory hooks and fixed-owned system
   validation/admission/namespace declarations. Lifecycle documentation updated.
3. **Implemented:** `BACKEND_REPO` binds singleton `global`, with an empty managed
   runtime, generic response table, and explicit SQL migration `1`. `storeResponse`
   validates `Schema.Json`, encodes once through the table codec, and upserts.
4. **Implemented:** direct GitHub module programs and public LibraryApi methods,
   awaited best-effort retention and error logging. GitHubBackend and its binding
   are removed; other providers keep their behavior.
5. **Implemented:** clean local API `v1` baseline and regenerated binding types;
   necessary imports have explicit package dependencies. API and Library ownership
   documentation reflects the new methods and storage boundary.
6. **Implemented and verified:** owning-project disposable Workerd lifecycle
   check and API integration coverage. All required scoped gates pass.
7. **Completed:** reviewed scoped changes, recorded verification, and archived
   this plan with no remaining work.

## Annotated examples

```ts
// 1 — No abbreviation: the factory resolves the singleton name "global".
const backendRepo = makeMigratableDORepo({
  namespaceBinding: "BACKEND_REPO",
  migratableDORepoConfig: makeMigratableDORepoConfig({
    namePattern: RoutePattern.parse("/global"),
    managedRuntime,
    dbConfig,
    // 2 — The owner defines SQL together with the typed table; config alone
    // does not create tables. Migrations run on every activation as needed.
    migrations: [
      {
        id: 1,
        name: "create-responses",
        sql: ["CREATE TABLE responses (key TEXT NOT NULL UNIQUE, payload TEXT NOT NULL);"],
      },
    ],
  }),
});
```

```ts
// 1 — Each method always normalizes and fetches upstream.
const payload = yield * scrapeGitHub({ url: canonicalUrl, token });
// 2 — Complete profiles (including contributions) use a distinct retained key.
const key = `github-profile:${canonicalUrl}`;
// 3 — Await storeResponse's envelope or rejection; log failures and continue.
// 4 — Return the successful fetched payload. A later call fetches again.
return payload;
```

```ts
{
  // 1 — Local bootstrap replaces the old GitHub class; no cache copy.
  tag: "v1",
  new_classes: ["BrowserHost", "StreamlineBackend"],
  new_sqlite_classes: [
    "BackendRepo", "InstagramBackend", "FigmaBackend",
    "GooglePlacesBackend", "LinkBackend",
  ],
}
```

## Verification results

1. Earlier scoped naming checks passed for omitted/null/string abbreviations,
   key/name round trips, unexpected-prefix rejection, singleton naming, and fixed
   config's existing explicit undefined behavior.
2. `pnpm nx run system-worker:lib` and `system-worker:ts` passed. The declaration
   build includes the lifecycle fixtures. Nx's existing empty config-project
   pattern warning did not prevent either gate.
3. Scoped lint passed for factory/naming source and all lifecycle fixtures/script
   using the sibling Zerospin tooling on identical mirrored files. The consumer's
   vendored lint installation cannot load `eslint-plugin-perfectionist`; no
   dependencies or unrelated lint configuration were changed to work around it.
4. `pnpm nx run system-worker:repo-lifecycle:check --excludeTaskDependencies`
   passed with disposable directories cleaned afterward. The standalone bundle
   needs no config alias or system bindings. SQL migrations stamp once and data
   survives restart. A failed upgrade rolls back its SQL and ledger stamp, keeps
   earlier migrations/data, and completes once after repair. Fresh activation
   failure never records bootstrap success. Fixed aggregate and service versions
   fail before dbConfig resolution; refused admission leaves storage/bootstrap
   untouched. Actual SystemRepo initializes without self-registration; actual
   spec acceptance admits registration, provisioning and one-time bootstrap.
5. API binding generation, typecheck, lint, and full Wrangler dry-run build passed.
   The full API build also ran Library's reusable build/declaration gate. Library
   `tsc` passed. No Library tests were created, modified, or run.
6. The scoped 13 Zerospin source/doc/fixture/script files and lifecycle target match
   the sibling checkout. This is a local mirror; nothing was committed, pushed,
   deployed, or published. Other current migration lists, R2 assets and unrelated
   Library/Studio/upstream work remain untouched.
7. `pnpm nx run @qrk.sh/api:test:workerd --excludeTaskDependencies` passed:
   15 tests across 2 files (10 new GitHub/storage tests and 5 existing upload/assets
   tests). Coverage includes JSON validation and once-encoded storage, fresh
   profile/repository fetching, preserved profile fields/contributions, separate
   response keys, contributions failure preservation, retained data across eviction,
   upstream failures preserving prior rows, envelope and transport failure logging,
   awaited retention, and deterministic overlapping last-write behavior.
8. Retention fault/barrier instrumentation uses the real failure envelope and
   single-use typed stub proxies at the caller's transport boundary. Those proxies
   avoid the installed pool's native rejected-RPC/cross-context callback failure.
   Tests clear only response rows rather than globally resetting bindings, which
   avoids the pool's teardown crash. Persistence and successful storage calls use
   the actual BackendRepo/SQLite implementation. No production test seam or runtime
   dependency/configuration workaround was added.
9. Final API typecheck/lint and scoped formatting/whitespace checks passed after
   the test instrumentation settled. Reviewed production changes had no actionable
   findings. The final local baseline changes only API's Wrangler migration list.

## Remaining work

**None.**
