# 018 — Move the Library backend into API

**Date:** 2026-10-03  
**Status:** Implemented, verified, and archived.

## Agreed behavior

1. One Worker named `api`, owned by `@qrk.sh/api`, serves module RPCs,
   Clerk-authenticated uploads, and assets. Retain the current Durable Object
   implementations, RPC methods, cache behavior, class names, and storage kinds.
2. Library owns module definitions, catalogs, views, browser declarations, and
   aggregate behavior. Add the direct `@qrk.sh/library/backendLibrary` entrypoint
   for API generation without exposing backend implementations through Library.
3. Fresh provider caches are approved. Preserve local state directories and R2
   image bytes. Do not rewrite saved absolute URLs using port 4101.
4. Preserve unrelated Next.js and aggregate WIP. Deployment, backend
   consolidation, and enabling Library's disabled image-upload UI are excluded.

## Implementation

1. Move `LibraryApi`, generation, and provider implementation into API. Group
   the six backend classes and provider helpers under matching API module
   folders; retain `BrowserHost` with Instagram scraping. Keep browser
   `worker/*.public.d.ts` paths and Library's existing reusable build output.
2. Add `/rpc` to API using `LibraryApi` with its current authentication behavior.
   Keep Clerk authentication and `QRKSH` writes for `/upload`; remove the
   anonymous Library upload endpoint. Route Library asset keys to `ASSETS`, and
   other asset keys to `QRKSH`. Preserve API errors and preflight handling, and
   allow Library's port-4100 origins through CORS.

   ```ts
   // 1 — Keep the existing module RPC interface behind the unified Worker.
   if (url.pathname === "/rpc") {
     return newWorkersRpcResponse(request, new LibraryApi(env));
   }

   // 2 — Existing Library image keys select the bucket that owns their bytes.
   const bucket = url.pathname.startsWith("/assets/library/")
     ? env.ASSETS
     : env.QRKSH;
   ```

3. Move Wrangler configuration, bindings, provider credentials, generated
   `Env`, and required runtime dependencies to API. Use fresh namespaces under
   the new Worker identity; retain each class's existing storage kind and both
   existing R2 buckets. Do not delete or reset old local state directories.
   Copy local Library `ASSETS` SQLite state and blobs into API's local R2
   state with SQLite backup and blob copies; verify their content fingerprints
   and retain the originals. Existing API `QRKSH` state stays in place.
4. Run API on `127.0.0.1:8787`, with inspector port `9231`. Library stays on
   port `4100`; retain `LIBRARY_WORKER_ORIGIN`, changing its default and local
   override to API. Library `dev`/`preview` start API through Nx, and API depends
   on Library's catalog build. Remove Library's Worker execution/typegen
   ownership and generated Worker globals without introducing a task cycle.
5. Update root, API, and Library READMEs. Keep Studio's upload origin at port
   `8787`. Record actual verification results below and archive this plan only
   after implementation and required verification are complete.

## Annotated examples

```text
1 — Library browser requests /rpc on port 4100.
2 — Next forwards the unchanged request to API on port 8787.
3 — LibraryApi returns the existing module backend capability.
4 — The module backend retains its existing cache and provider behavior.
```

```text
1 — GET /assets/library/example.png reads ASSETS key library/example.png.
2 — GET /assets/user_123/_/example.png reads QRKSH key user_123/_/example.png.
3 — POST /upload without a Clerk bearer token rejects before storing bytes.
4 — A saved absolute port-4101 URL is unchanged until its origin is updated.
```

## Verification

1. Regenerate API types; run scoped Nx build, typechecking, and lint for API and
   Library, including Library's Next app build. Run existing API upload tests.
   Do not write, modify, or run Library tests.
2. Verify Wrangler readiness and bundling. Manually check Library RPCs,
   provider-error responses, generation, Clerk upload rejection/success, and
   reads from both asset buckets.
3. Confirm Library and root development commands start one API Worker without
   Nx task cycles. Review the scoped diff for unrelated WIP preservation.

## Results

1. API now owns the Worker implementation, provider helpers, generated `Env`,
   Wrangler configuration, and runtime dependencies. Library exports the direct
   `backendLibrary` entrypoint and retains its browser declarations, catalogs,
   views, and aggregate behavior. Root, API, Library, and Studio documentation
   reflect the new ownership and origins; the GitHub Activity handoff links now
   resolve to the moved API sources.
2. API type generation passed and includes all configured bindings and private
   environment names. Library `build`, `tsc`, `lint`, and `build:app` passed;
   API `tsc`, `lint`, Wrangler dry-run `build`, and `test:workerd` passed.
   API's existing five upload tests include authentication success and storage.
   API verification used the workspace's existing Effect `4.0.0-rc.112`
   dependency link. Library tests, fixtures, and `*.public.d.ts` files were
   unchanged; no Library tests were run.
3. The actual Library `preview` Nx target started Next on port `4100` and one
   API Worker on port `8787`, with inspector port `9231`; both reported
   readiness. Root and Library development task graphs contain one API `dev`
   task with Library's catalog build as a prerequisite, no retired
   `dev:worker` task, and no cycle. The full root server set was not launched.
4. Manual RPC checks called all six module backends both directly and through
   the Library proxy. Invalid provider requests returned their expected `Left`
   values; Google Places and Streamline empty requests returned `Right`.
   A nonexistent GitHub profile returned `profile-unavailable` through the
   proxy. Generation checks exercised prompt validation, missing and valid
   catalog lookup, and current-spec validation; successful external model
   generation was not separately exercised.
5. API preflight returned `204`, unsigned upload requests returned Clerk `401`,
   and unknown API routes retained `404`. Existing upload integration coverage
   verified authenticated success and persisted bytes.
6. Read all three original local `ASSETS` objects through the unified API with
   `200` responses and bytes matching their original blobs. A temporary PNG
   in `QRKSH` also returned `200`, with matching content type and bytes; it was
   deleted after verification. Local Library R2 SQLite snapshots and blobs
   were copied into API state, original state remained unchanged, and a backup
   was retained outside the repository.
7. Five local provider credential keys moved to API. The public Mapbox token
   remains in Library, and Clerk configuration remains in API. Saved absolute
   port-4101 URLs were not rewritten. Deployment, backend consolidation, and
   Library upload UI activation remain outside this completed migration.
8. Scoped source/config formatting passed for 34 files, and scoped
   `git diff --check` passed. Existing unrelated WIP was preserved. Nx reported
   only the pre-existing upstream warning about an empty `dependsOn` setting.

## Remaining work

None.
