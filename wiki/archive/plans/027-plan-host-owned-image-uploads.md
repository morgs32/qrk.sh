# Plan 027: Host-owned Image uploads

**Status:** Implemented, verified, and archived on 2026-10-16.

## Problem and agreed scope

1. The shared Image module currently constructs HTTP requests using an upload URL, `siteId`, and an authorization-header Effect. These are host responsibilities: Studio uploads with Clerk credentials and its current site ID; Library's standalone app uploads anonymously.
2. Replace those environment fields with one host-supplied operation in the existing `ImageUploadEnvironment`:

   ```ts
   // 1 — Image supplies only the validated file.
   upload: (file: File) => Effect.Effect<string, Error>;
   // 2 — Success returns the uploaded image URL for the existing local draft.
   //     The host owns HTTP, credentials, multipart fields, and response decoding.
   ```

3. Studio's `EditorLayout` and Library's `InitializedLibraryLayout` provide that operation through their existing Effect Layer and `ImageUploadRuntimeContext`. Keep the existing session runner and its interruption options.
4. The shared Image module no longer knows about `siteId`, endpoints, authorization headers, multipart fields, or the upload API's response structure. Each host decodes its untrusted HTTP responses with Effect Schema. Server authentication, validation, routes, response shapes, storage keys, and asset serving remain unchanged.
5. Image continues owning file validation, picker/drop behavior, local drafts, pending/error feedback, Save gating, request cancellation, and suppression of late results. Upload success changes only the draft URL; Save persists the Image state. Cancel and leaving the form abort unfinished uploads and preserve saved state. Completed uploads remain stored after cancellation or replacement.
6. Keep `/rpc` and host rewrites, Mapbox token configuration, shared preview chrome and its decorative `qrk.sh` label, and shared drawer sizing unchanged. These follow-ups were considered and explicitly excluded from this implementation.
7. Add no new named types, source helpers, providers, wrappers, dependencies, casts, model/contract versions, migrations, or storage resets. Preserve the concurrent publication-serialization changes and Library's current direct-source/Turbopack wiring.

## Ownership and rationale

1. Library owns what an Image is and how its form behaves. An upload operation returning a URL is enough for that behavior; the form does not need QRK's site or authentication concepts.
2. Studio owns fresh Clerk-token acquisition, `NEXT_PUBLIC_API_URL`, authenticated `POST /upload`, and the current route's `siteId`. Library's standalone app owns anonymous `POST /image/upload`. Both already supply Image's environment, so no additional injection mechanism is needed.
3. Keep the two small host requests explicit. A shared HTTP helper would preserve the protocol coupling that this change removes. Moving the entire form into Studio would break Library's real standalone consumer.
4. Endpoint injection, a Mapbox configuration provider, configurable preview chrome, and host-supplied drawer geometry were considered. Existing callers share those behaviors and already configure backend origins/tokens in their host setup; no current requirement justifies another configuration layer.
5. The existing [ownership research](../../research/studio-publishing-ownership.md) records the scan. [Archived Plan 020](020-plan-image-uploads.md) is historical evidence of the original upload behavior; its older SWR integration does not describe today's Effect/session wiring. Preserve archived plans, including Plan 025, unchanged. There are no existing project ADRs for this boundary.

## Ordered implementation

1. Change the inline service shape in `modules/image/ImageUploadEnvironment.ts` to the agreed `upload` operation. Keep its existing defining file, service identity, and package export. Keep `ImageUploadRuntimeContext` unchanged unless ordinary compilation identifies a necessary consequence of the agreed callback type.
2. In Studio's `EditorLayout.tsx`, replace the environment's URL/site/authorization fields with an inline named `Effect.fn` upload operation:
   1. Retrieve a fresh Clerk token for each invocation through `getClerkToken`. Preserve the signed-out message and existing typed-failure/defect behavior.
   2. Build multipart `file` and `siteId` fields from the supplied file and current route ID.
   3. POST to the existing configured `/upload` URL with its bearer header. Forward the Effect interruption signal into `fetch`.
   4. Preserve the current JSON parsing, success/error decoding, URL return, and server-error message. Keep failures compatible with the agreed `Error` channel without casts.
3. In Library's `InitializedLibraryLayout`, supply an inline named `Effect.fn` operation that performs the existing anonymous request to `/image/upload`. Send only the multipart file, decode the same success/error shapes, return the URL, and preserve interruption. Do not add credentials or a site field.
4. In `ImageForm.tsx`, invoke the environment's operation inside the existing `runtime.runPromise` call. Keep its AbortController signal options and every existing validation, busy-state, draft, Save, Cancel, cleanup, and stale-result check. Remove the old `uploadImage.ts` implementation and import; it has one source caller and no package export, and retaining it would leave a forwarding-only helper.

   ```ts
   // 1 — Resolve the operation supplied by the current host.
   const imageUrl = await runtime.runPromise(
     Effect.gen(function* () {
       const { upload } = yield* ImageUploadEnvironment;
       return yield* upload(file);
     }),
     // 2 — Existing cancellation interrupts the host operation and its fetch.
     { signal: controller.signal },
   );
   // 3 — Keep the existing aborted/obsolete completion check before changing draft state.
   ```

5. Keep the normal form contract, module/view registration, API Worker, Site Settings uploads, aggregate/session construction, and publication code unchanged. Import source symbols from their defining files; do not add a barrel or compatibility export.
6. Update Library and Studio READMEs to describe the host callback and actual responsibilities. Reconcile the ownership research with the implemented result and record why the other scan candidates remain unchanged. Reconcile existing glossary terminology after implementation; no new domain term is expected. Create an ADR only if the implemented decision meets all three repository criteria: hard to reverse, surprising without context, and a real trade-off.

## Planned files

`+` creates, `~` modifies, `-` removes. No new source files are required.

```text
qrk.sh/
├── apps/library/
│   ├── ~ app/LibraryLayout.tsx
│   ├── modules/image/
│   │   ├── ~ ImageUploadEnvironment.ts
│   │   ├── ~ ImageForm.tsx
│   │   └── - uploadImage.ts
│   └── ~ README.md
├── apps/studio/
│   ├── ~ app/[username]/site/[siteId]/page/[pageId]/EditorLayout.tsx
│   └── ~ README.md
└── wiki/
    ├── + archive/plans/027-plan-host-owned-image-uploads.md
    └── ~ research/studio-publishing-ownership.md
```

## Verification and completion

1. Use the existing environment/runner and the two actual Image forms as the verification seams. Run the normal `pnpm nx run @qrk.sh/studio:build` production compilation. Observe normal standalone Library development compilation and manually open its Image form; Library has no production `build` target. Use running servers where available and documented Nx dev targets where needed. Add no test suites, backend integration tests, or standalone check gates.
2. Review each host request: Studio uses fresh credentials and the current site ID; Library sends neither authorization nor a site ID. Endpoints, response codecs, API behavior, and resulting asset URLs remain unchanged. Confirm shared Image code contains none of those protocol details and no references remain to the removed helper.
3. Manually verify a valid upload in both applications: pending fields/Save are disabled, Cancel remains available, success updates only the draft URL, and Save persists the image across reload. Confirm the returned asset renders and Studio's request uses its current site's grouping. Preserve the existing login and browser/session/storage state.
4. Review the existing rejection paths with representative invalid-file and failed-upload scenarios. Invalid files start no request; failed uploads show an error and retain the saved image/draft behavior. A later valid upload remains usable. Do not add retry machinery.
5. Verify cancellation during an in-flight upload and navigation to another brick: transport aborts and late results cannot change either saved state or a later form. Cancel after a completed upload restores saved form state and leaves the already-stored asset intact. Keep breakpoint-switch behavior unchanged.

   ```text
   1 — Studio selects a photo: its host POSTs file + current siteId with Clerk auth.
   2 — The response URL enters Image's draft; the saved Image is still unchanged.
   3 — Save commits that draft. A second upload cancelled in flight cannot replace it.
   4 — Library follows the same editing flow through its anonymous host request.
   ```

6. Remove any temporary verification bricks through existing UI actions, preserve pre-existing content and retained upload bytes, and report runtime limitations without resetting or repairing unrelated storage/configuration.
7. Record actual compilation and manual-review evidence in this plan. Complete the documentation step, mark remaining work None only when implementation and agreed verification are finished, then move this file to `wiki/archive/plans/` without changing its filename and repair affected links.

## Results

1. Implemented the single `upload(file)` operation in the existing environment. Studio and standalone Library now own their HTTP requests and response decoding in their existing layouts. Image retains its validation, draft, pending, error, Save, Cancel, and cleanup behavior. Removed the former `uploadImage.ts` helper and its only import; package exports and the runtime context are unchanged. Independent source review found no issues and no HTTP/site/auth details remain in shared Image code.
2. `pnpm nx run @qrk.sh/studio:build` passed normal Turbopack production compilation, TypeScript, and route generation, exit 0 in 15.0 seconds. Log: `/tmp/qrk-plan027-studio-build.log`. Normal standalone Library development compilation served its Image form successfully. No Library production-build target, test suite, backend integration test, or standalone check gate was added or invoked.
3. Verified real SVG uploads in the existing Chrome profile in both applications. Network observation confirmed Studio's `/upload` request included authorization and the exact current site ID; Library's `/image/upload` request included neither. Pausing the requests confirmed disabled fields/Save and enabled Cancel. Success changed only the draft URL; Save rendered the asset, and reload preserved the saved URL and loaded image in each app. Screenshots: `/tmp/qrk-plan027-studio-saved.jpg` and `/tmp/qrk-plan027-library-saved.jpg`.
4. Both forms rejected an invalid text file with zero upload requests. A simulated HTTP 500 JSON response displayed its `Plan 027 upload failure` message without changing the saved image. Subsequent valid uploads succeeded in both forms. The initial Studio attempt during development hot reload failed before starting a request; a fresh page load resolved it without a source change, and repeated upload/error/cancellation flows then passed.
5. Cancel during a paused upload emitted `net::ERR_ABORTED` in both apps and restored the saved URL. Cancel after a completed retry discarded its draft URL while leaving the completed asset stored; opening the returned Library asset URL still rendered the SVG. A Studio breakpoint switch preserved its pending upload. Switching from the saved Studio brick to a second temporary brick aborted the prior request and left the new form at its unchanged default URL.
6. Removed all three temporary verification bricks through the normal drag-outside action: two in Studio and one in Library. Both original empty grids are restored; Studio is back on its original Page Settings route with unchanged saved metadata and no Publish Updates action. Cleared temporary network interception, restored Library's initial DevTools visibility, and preserved existing login, browser/session/backend storage, retained assets, and publication history. No storage reset, API/configuration change, or adjacent fix was needed.
7. Updated Library and Studio READMEs and the existing ownership research. Reviewed the glossary: no domain meaning or terminology changed, so no glossary edit was needed. This reversible integration change does not meet all three ADR criteria; no ADR was created. The other scan follow-ups and historical plans remain unchanged. Archived this plan from `wiki/plans/` and repaired its relative and inbound links.

## Remaining work

None.
