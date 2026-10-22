# Host-owned upload functions through SWRConfig

**Status:** implemented October 22, 2026. Verification was explicitly waived by the user; no builds, tests, browser uploads or failure injection were performed for this cleanup.

## Outcome and scope

1. App's EditorLayout and Storybook's ModulePlayground each own a concrete `uploadImage(file, { signal }): Promise<string>` function and supply it through `SWRConfig`. The previously proposed dedicated Image upload context was not introduced.
2. ImageForm reads the function with `useSWRConfig` and explicitly supplies its mutation implementation to `useSWRMutation`. SWR owns request pending/error state, with revalidation and cache population disabled. File validation/save errors, drafts, cancellation and current-request guards remain in the form.
3. Deleted the upload Effect service and generic runtime context. Removed both host upload layers and runner adapters, Storybook's upload-layer memoization, and the form's Effect service lookup. Response decoding remains at each host's existing boundary through synchronous Effect Schema decoding.
4. Site Settings acquires its upload token directly through Clerk's Promise API. Its ordinary uploader, toasts, session reads/commands and unrelated QR-code SWR read remain intact. The existing Effect credential helper remains for Zerospin authentication.
5. Preserved the authenticated and anonymous protocols, file validation, draft-versus-Save distinction, abort signals, late-result suppression and completed-asset lifetime. No dependency upgrades, installed-package edits, Zerospin changes, initializer changes, backend changes, storage resets or asset deletion were included.
6. This supersedes the upload service/runner arrangement in [Plan 027](027-plan-host-owned-image-uploads.md) and the corresponding subsection of [Plan 021](../../plans/021-plan-brick-forms.md). Their host ownership and persistence boundaries remain valid. [Plan 040](040-plan-concrete-session-initializers.md) remains complete and outside this work.

## Implemented configuration boundary

1. Both existing host provider sites now supply the function directly, without adding a provider component or wrapper hook:

   ```tsx
   // 1. EditorLayout or ModulePlayground owns this concrete async function.
   // 2. Existing descendants receive it through SWR configuration.
   <SWRConfig value={{ uploadImage }}>
     {/* Existing editor or playground subtree. */}
   </SWRConfig>
   ```

2. Added [ImageUploadSWR.d.ts](../../../apps/app/modules/image/ImageUploadSWR.d.ts), a type-only augmentation of SWR's exported `_internal` entrypoint. Its generic declaration matches upstream, including the existing defaults:

   ```ts
   import type { BareFetcher, Fetcher } from "swr";
   import "swr/_internal";

   declare module "swr/_internal" {
     // 1. Preserve the upstream generic declaration for interface merging.
     interface PublicConfiguration<Data = any, Error = any, Fn extends Fetcher = BareFetcher> {
       // 2. Optional capability: no uploader preserves manual URL entry.
       uploadImage?: (file: File, options: { signal: AbortSignal }) => Promise<string>;
     }
   }
   ```

3. This types both the provider and `useSWRConfig()` without casts, a custom configuration wrapper or a separate Image upload context. The accepted trade-off is one augmentation tied to SWR's exported configuration interface. No installed packages were changed.
4. The registered module form contract remains `state`, `onSave` and `onCancel`. No Image-specific upload prop was added to shared module contracts, renderers or initializers. [Form contract](../../../apps/app/modules/lib/types.ts), [Image view](../../../apps/app/modules/image/imageView.tsx).

## Implemented form behavior

1. [ImageForm](../../../apps/app/modules/image/ImageForm.tsx) explicitly supplies the host operation to its own mutation hook:

   ```tsx
   const { uploadImage } = useSWRConfig();
   const { trigger, isMutating, error, reset } = useSWRMutation(
     "image-upload",
     (_key, props: { arg: { file: File; signal: AbortSignal } }) => {
       const { arg } = props;
       if (uploadImage === undefined) throw new Error("Image upload is unavailable");
       // 1. Pass the form's cancellation signal into this host's function.
       return uploadImage(arg.file, { signal: arg.signal });
     },
     // 2. Uploading does not refresh or populate an SWR read resource.
     { revalidate: false, populateCache: false, throwOnError: true },
   );
   ```

2. File selection/drop validates exactly one nonempty PNG, JPEG, WebP or SVG up to 5 MiB, creates a request-scoped AbortController and calls `trigger({ file, signal })`. No React effect starts an upload. SWR supplies pending/request-error state; local validation/save errors and drafts remain separate. Event handlers consume mutation rejections while SWR presents the current request error.
3. A successful upload updates only the draft URL. Save performs the existing model-derived state validation and `onSave`/`updateBrick` path. Cancel discards the draft. Fields and Save remain disabled while uploading; Cancel remains available.
4. New upload attempts, Save and Cancel reset mutation state at the existing error-clearing points. Reset does not abort transport. Cancel separately aborts and invalidates the active controller, and the existing component-lifetime cleanup does the same on unmount.
5. Current-request guards remain after awaiting the URL, in rejection handling and when clearing the active controller. A cancelled or superseded request cannot update the draft even when its host ignores abort or SWR returns a discarded success to the awaiting caller:

   ```tsx
   // Existing file validation and controller registration precede this block.
   const imageUrl = await trigger({ file, signal: controller.signal });
   // 1. Reset alone cannot prevent the awaiting caller from receiving a late URL.
   if (controller.signal.aborted || activeUpload.current !== controller) return;
   // 2. Only the current edit receives the uploaded URL; Save stays separate.
   setDraft((current) => ({ ...(current ?? initialState), imageUrl }));
   ```

6. Without `uploadImage`, the event handler returns and the picker/drop UI is hidden; manual Image URL entry and Save remain available. Existing BrickDetail navigation/remount handling and breakpoint draft lifetime are retained.

## Implemented hosts and protocols

1. [EditorLayout](../../../apps/app/app/[username]/site/[siteId]/page/[pageId]/EditorLayout.tsx) retrieves a fresh token through `getToken()` for each invocation, preserves visible offline/signed-out errors and checks the signal after token acquisition. Clerk token acquisition itself is not abortable. App retains its configured API origin, current site grouping and authenticated multipart request:

   ```tsx
   // Excerpt inside the host-owned async uploadImage function.
   const { signal } = options;
   const token = await getToken().catch((cause) => {
     if (ClerkOfflineError.is(cause)) throw new Error("Clerk is offline");
     throw cause;
   });
   // 1. Cancel while awaiting credentials must prevent the subsequent HTTP request.
   signal.throwIfAborted();
   if (token === null) throw new Error("Sign in to upload images");
   const body = new FormData();
   body.set("file", file);
   body.set("siteId", params.siteId);
   // 2. App owns this protocol; ImageForm receives only the resulting URL.
   const response = await fetch(`${apiUrl.replace(/\/$/, "")}/upload`, {
     method: "POST",
     headers: { Authorization: `Bearer ${token}` },
     body,
     signal,
   });
   ```

2. [ModulePlayground](../../../apps/app/modules/lib/ModulePlayground.tsx) retains anonymous `POST /image/upload`, sending only the file and forwarding the signal. Its unrelated specs memoization remains. Image stories still use this same playground and shared form.
3. Both hosts parse JSON as `unknown`, synchronously decode `{ key, url, contentType }` on success or `{ code, message }` on HTTP failure, and return the URL or reject with the decoded message. No shared HTTP adapter was introduced.
4. [Site Settings](../../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx) now calls fresh `getToken()` directly, preserving offline/signed-out toast feedback. Its Promise upload protocol, busy state and validation behavior are unchanged. It does not consume ImageForm's mutation or the optional upload configuration field. [getClerkToken](../../../apps/app/lib/getClerkToken.ts) remains unchanged for the existing Zerospin credential callback.
5. Cancellation does not promise rollback of an object already stored by the server. Completed R2 objects, public asset URLs and GET behavior retain their existing lifetime. Uploaded bytes are not saved into Brick state or browser session backups.

## Implementation sequence and affected files

1. Added the SWR configuration augmentation and changed ImageForm to its own mutation hook. Removed duplicate local request pending/error state while retaining local validation/save feedback and request-lifetime guards.
2. Rewrote the two existing host upload bodies as concrete async functions and replaced their old runtime providers with `SWRConfig`.
3. Deleted both Image upload service/runtime files and removed upload-only Effect/Layer imports, runner adapters and memoization.
4. Removed Site Settings' upload-token session runner without changing its other session use or uploader protocol.
5. Updated the App/module READMEs, current upload research, publishing ownership research and only the superseded upload subsection/status of active Plan 021. Archived Plans 027 and 040 remain historical. No glossary or ADR was introduced.
6. Recorded the explicit no-verification policy, archived this plan with its filename preserved and adjusted its relative and inbound links.

```text
qrk.sh/
├── apps/app/
│   ├── ~ README.md
│   ├── app/[username]/site/[siteId]/page/[pageId]/
│   │   ├── ~ EditorLayout.tsx
│   │   └── SiteSettings/
│   │       └── ~ SiteSettings.tsx
│   └── modules/
│       ├── ~ README.md
│       ├── image/
│       │   ├── ~ ImageForm.tsx
│       │   ├── + ImageUploadSWR.d.ts
│       │   ├── - ImageUploadEnvironment.ts
│       │   └── - ImageUploadRuntimeContext.ts
│       └── lib/
│           └── ~ ModulePlayground.tsx
└── wiki/
    ├── archive/plans/
    │   └── ← 041-plan-host-owned-upload-functions.md
    ├── plans/
    │   └── ~ 021-plan-brick-forms.md
    └── research/
        ├── ~ host-owned-image-uploads.md
        └── ~ studio-publishing-ownership.md
```

## Verification policy

1. The user explicitly retained the no-verification policy for this implementation. No builds, tests, browser uploads, failure injection or other execution checks were run. No tests or verification machinery were added. Earlier upload verification records describe prior code and do not establish this revision's runtime behavior.
2. Cancellation, late-result suppression, optional manual-URL-only operation and draft-versus-Save behavior remain implementation requirements; they were not exercised in this turn. The same applies to authenticated and anonymous HTTP, Clerk feedback and response decoding.
3. If verification is separately requested later, the existing authenticated App Image drawer and anonymous Modules/Image Storybook playground are the relevant seams. No new routes, fixtures, runners or live provider probes are needed to define that future scope.

## Remaining work

None. Implementation and documentation are complete within the approved scope; verification was explicitly waived.
