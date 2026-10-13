# 020 — Image dropzone and R2 uploads

**Date:** 2026-10-13  
**Status:** Implemented, verified, and archived.

## Agreed behavior and ownership

1. Add a single-image dropzone and picker above Image URL and Title in both
   drawers. Upload immediately; success changes the draft's `imageUrl`, and Save
   persists the complete brick state.
2. Studio uses Clerk-authenticated `POST /upload` with its site ID. Library uses
   anonymous `POST /image/upload`. Both use the existing API Worker and `QRKSH`
   bucket. The public route is explicitly approved; sign-in for Library and a
   shared anonymous Studio flow were rejected.
3. The host owns transport, authentication, and mutation pending. Image owns
   file validation, drag feedback, upload errors, and request cancellation.
   Replace the earlier `onBusyChange` design with operation-owned pending passed
   down to Image. No custom form hook or provider is needed.
4. Save is blocked while uploading. Cancel aborts unfinished transport and
   restores committed state. Completed R2 objects remain stored; no deletion,
   compression, cropping, retry, migration, or deployment is included.
5. Accept one nonempty PNG, JPEG, WebP, or SVG up to 5 MiB, preserving the API's
   existing validation and public URL behavior. Article uploads remain disabled.

## Ordered implementation

1. Extend the existing optional Form contract and forward its capabilities
   through `makeModuleView` and `imageView`. Keep shapes inline, without new named
   types, casts, wrappers, or dependencies.

   ```ts
   // 1 — The host supplies transport and authentication.
   uploadImage?: (props: { file: File; signal: AbortSignal }) => Promise<string>;
   // 2 — Image and Save read the same operation-owned pending state.
   isUploadingImage?: boolean;
   ```

2. Use `useSWRMutation` in each host with `revalidate: false`. Alias `trigger`
   directly to `uploadImage` and `isMutating` to `isUploadingImage`. Library
   combines uploading with its existing save mutation only where needed.

   ```tsx
   // 1 — Pending belongs to the operation supplied by this host.
   const { trigger: uploadImage, isMutating: isUploadingImage } =
     useSWRMutation(/* host-specific multipart upload */);
   // 2 — Library combines operations for Save and form status.
   const isBusy = isUploadingImage || isSaving;
   // 3 — No child-to-host busy synchronization.
   <Form state={formState} onChange={onChange}
     uploadImage={uploadImage} isUploadingImage={isUploadingImage} />;
   ```

3. Studio obtains a Clerk token, submits multipart `file` and `siteId`, and
   forwards the abort signal. Library submits multipart `file` through its Next
   proxy. Decode success/error responses with Effect Schema; return the URL or
   reject. Keep upload errors inside Image. For the local web frontend on
   `localhost:3000`, API CORS allows that origin and API's local environment sets
   `CLERK_AUTHORIZED_PARTY=http://localhost:3000`, matching the existing Zerospin
   configuration. The tracked direct-Studio authorized-party default remains
   unchanged.
4. Reuse `handleUpload` for both API routes, naming its storage argument
   `ownerPrefix`. Private uploads supply the verified Clerk subject; public
   uploads supply `image`, producing Library keys `image/_/<uuid>.<ext>` served
   by existing `/assets/*` handling from `QRKSH`.
5. Image owns an active AbortController, rejects invalid or multiple files,
   prevents duplicate starts, disables its fields while pending, and ignores
   aborted/obsolete completions. File drag/drop must not reach brick drag
   handlers. Native picker activation must work with the keyboard.
6. Both hosts guard Save and reset the upload mutation on Cancel before the
   existing editor remount. Image's layout cleanup aborts transport. Library's
   keyed host already remounts on brick change; Studio resets mutation state on
   active brick change. SWR reset alone does not abort transport.

## Planned files

`~` modifies; `+` creates.

```text
qrk.sh/
├── ~ apps/api/Worker.ts
├── ~ apps/api/handleUpload.ts
├── ~ apps/api/http.ts
├── ~ apps/api/upload.e2e.spec.ts
├── ~ apps/api/README.md
├── ~ apps/library/lib/types.ts
├── ~ apps/library/make/makeModuleView.tsx
├── ~ apps/library/modules/image/ImageForm.tsx
├── ~ apps/library/modules/image/imageView.tsx
├── ~ apps/library/app/bricks/[brickId]/page.tsx
├── ~ apps/library/next.config.ts
├── ~ apps/library/README.md
├── ~ apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickDetail/BrickDetail.tsx
├── ~ apps/studio/README.md
└── + wiki/archive/plans/020-plan-image-uploads.md
```

## Verification and documentation

1. Extend API Workerd upload coverage for anonymous storage/public retrieval,
   invalid content/files, supported MIME and size limits, method handling, and
   CORS. Preserve authenticated upload assertions.
2. Run resolved Nx `ts` and `lint` for Library, Studio, and API, with required
   dependency builds. Run the API Workerd upload suite. Never write or run Library
   tests; preserve unrelated WIP and report adjacent failures without repair.
3. Manually verify both drawers: picker/drop, keyboard access, feedback, Save
   gating, failure/retry, Cancel during upload, brick switching, URL/title editing,
   and persisted rendering.

   ```text
   1 — Drop a photo: upload starts; Save is unavailable.
   2 — Success: draft URL changes; committed state is unchanged.
   3 — Save: the uploaded photo persists.
   4 — Cancel another upload: no late result changes either brick.
   ```

4. Update affected READMEs and reconcile terminology with the implemented result.
   Seek approval before creating a missing glossary after implementation. No ADR
   is expected for these reversible choices. Record actual verification, mark
   remaining work None, then archive this plan without changing its filename.

## Results

1. Implemented the shared upload capability and host-owned pending flag, Image
   dropzone/picker, validation and abort lifecycle, both host mutations, Library
   proxy, anonymous API route, and documentation. Source review found no
   actionable issues. No dependencies or new named types were added.
2. `pnpm nx run-many -t ts lint -p @qrk.sh/library @qrk.sh/studio @qrk.sh/api`
   passed all selected checks and its Library build prerequisite. Scoped
   formatting and `git diff --check` passed. No Library tests were written or run.
3. `pnpm nx run @qrk.sh/api:test:workerd -- upload.e2e.spec.ts` passed all
   17 upload/asset checks after adding local web-frontend CORS coverage, including
   anonymous storage/retrieval, rejection paths, method handling, and preserved
   authenticated upload behavior. API `ts` and `lint` passed again after that
   alignment; scoped formatting and diff checks passed.
4. Verified Library in the existing Chrome profile at `127.0.0.1:4100`: keyboard
   picker, real R2 upload, disabled fields/Save with enabled Cancel while paused,
   file drop, server failure with unchanged URL, successful retry, Save and
   rendering after reload, invalid type/multiple-file rejection with zero upload
   requests, and title draft cancellation. Cancel and brick switching both
   emitted `net::ERR_ABORTED`; the saved Image remained unchanged.
5. Removed both temporary verification bricks through the normal drag-outside
   behavior and restored the original empty grid and DevTools-open preference.
   Cleared request interception. Completed fixture uploads remain in R2 under
   the agreed retention behavior.
6. Studio's long-running Next process served old 5.0.1 dependencies despite the
   current 6.0.1 installation. Restarted only Studio's dev target against the
   existing dependency outputs. Its configured Zerospin backend on 8788 was down;
   starting the ordinary backend without reset failed its authored system-spec
   check with `aggregate-spec-mismatch` for `user@1.0.0`. No user storage, accepted
   specs, or unrelated source was reset or repaired in that first attempt. The
   user subsequently explicitly authorized `--clean` to unblock verification.
7. Updated the three affected READMEs, including the existing Studio Article
   upload documentation discrepancy. No new domain terminology was introduced;
   no glossary or ADR was created.
8. Ran the authorized `pnpm nx run @qrk.sh/zerospin:dev --clean`; its Worker
   reported `Ready on http://127.0.0.1:8788/ (system spec accepted)`. The API
   Worker and its R2 storage were preserved. The earlier Library fixture asset
   still returned HTTP 200 afterward.
9. Aligned API's local authorized party with the actual frontend origin and
   added `localhost:3000` to the CORS allowlist. Restarted API without reset;
   private uploads remain Clerk-authenticated. No secret values were printed or
   copied, and the tracked authorized-party default was preserved.
10. Verified authenticated Studio in the existing Chrome profile at
    `localhost:3000`: keyboard picker, real upload into a user/site-prefixed R2
    key, pending Save/field gating with enabled Cancel, file drop, failure with
    unchanged saved URL, successful retry, Save/rendering and persistence after
    reload, invalid-file rejection without a request, and URL/title draft
    cancellation. Cancel and switching between bricks emitted `net::ERR_ABORTED`
    and preserved the saved Image. Temporary request interception was cleared.
11. Removed both Studio verification bricks through the existing drag-outside
    behavior and restored the DevTools-open preference. The empty local site
    named `Image upload verification` and its page remain because no site/page
    delete action exists. Completed R2 fixture objects remain as agreed. Studio,
    API, and the clean Zerospin backend remain running for normal development.
12. A final visual check found stale generated Studio CSS missing the new
    dropzone utilities. Refreshed only Studio's generated Webpack dev cache and
    restarted its dev target; stylesheet source was unchanged. Confirmed the
    dropzone's 2 px dashed border and 144 px minimum height, saved a screenshot
    with the uploaded fixture rendered, and removed the third temporary brick.
    The verification site is empty again.

## Remaining work

None.
