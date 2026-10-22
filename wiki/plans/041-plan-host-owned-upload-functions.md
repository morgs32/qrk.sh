# Host-owned upload functions

**Status:** proposed October 22, 2026. Planning only; no application changes or verification performed.

## Outcome and scope

1. App and Storybook each own an ordinary `uploadImage(file, { signal }): Promise<string>` function. Image receives the function and does not know which library implements it. Either host may use plain `fetch`, SWR mutation, or its own internal implementation.
2. Replace the existing generic upload runtime context with one Image-owned React context containing that function. Remove the Image upload Effect service, upload layers and generic program runner. Keep the shared module-form contract unchanged.
3. Use direct async functions in the two current hosts for this cleanup. The form already owns busy/error/draft state, and neither host currently needs an upload cache. SWR remains an author choice, rather than another required layer.
4. Also remove Site Settings' remaining upload-related use of `session.runPromise` for Clerk-token acquisition. Its existing Promise uploader remains host-owned and independent of Image's context.
5. Preserve the existing request protocols, validation boundaries, save behavior, cancellation, authentication and asset lifetime. No Zerospin changes, initializer changes, package upgrades, backend changes, storage resets, asset deletion, shared upload client, new provider component, wrapper hook or named type are needed.
6. This plan supersedes the upload service/runner arrangement recorded in [Plan 027](../archive/plans/027-plan-host-owned-image-uploads.md) and the corresponding Image upload subsection of [Plan 021](021-plan-brick-forms.md). Their host ownership and draft/save distinction remain valid. [Plan 040](../archive/plans/040-plan-concrete-session-initializers.md) remains complete and outside this work.

## Current source and ownership

1. [EditorLayout](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/EditorLayout.tsx) already owns authenticated `POST /upload`, a fresh Clerk token for each request, the current `siteId`, multipart construction and response decoding. It constructs `Layer.succeed(ImageUploadEnvironment, ...)`, then provides a generic `runPromise` function through `ImageUploadRuntimeContext`.
2. [ModulePlayground](../../apps/app/modules/lib/ModulePlayground.tsx) owns Storybook's anonymous `POST /image/upload`, supplying only `file`. It builds the same Effect layer inside `useMemo` and provides the same generic runner. [Image stories](../../apps/app/modules/image/Image.stories.tsx) use this host.
3. [ImageForm](../../apps/app/modules/image/ImageForm.tsx) gets the runner from React context, constructs an Effect program solely to obtain `ImageUploadEnvironment.upload`, then awaits the returned URL. It owns file validation, draft state, busy/error presentation, its AbortController and stale-result guards.
4. The renderer path is `EditorLayout -> BrickDetail -> modulesHash.image.Form -> ImageForm`, and Storybook renders `modulesHash.image.Form` directly. [IModule.Form](../../apps/app/modules/lib/types.ts), [makeModuleView](../../apps/app/modules/make/makeModuleView.tsx) and [imageView](../../apps/app/modules/image/imageView.tsx) expose `state`, `onSave` and `onCancel`. Passing an Image-specific upload prop through them would expand shared contracts. Replacing the existing context's payload avoids that expansion.
5. [SiteSettings](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx) already has an ordinary Promise uploader and uses neither Image context nor Image layer. Its upload handler still calls `session.runPromise(getClerkToken({ getToken }))`. Its existing SWR read generates a QR code; it is unrelated to image uploads.
6. [getClerkToken](../../apps/app/lib/getClerkToken.ts) is also used by [ZerospinUser](../../apps/app/components/ZerospinUser.tsx). Keep that existing Effect program for the credential callback that requires it; do not convert the shared authentication helper or refactor initializer code to simplify these two ordinary upload handlers.
7. [Research](../research/host-owned-image-uploads.md) records the current source, official React/SWR guidance and installed SWR behavior. Installed Intent discovery and the matching React/Browser/parallel-model guidance were loaded. The old `$spec` skill is absent; the available shared `grill-me` guide supplies the planning format used here.

## Concrete replacement

1. Replace `ImageUploadRuntimeContext.ts` with `ImageUploadContext.ts`, owned by the Image module. Its entire value is the upload function, with an inline shape:

   ```tsx
   import { createContext } from "react";

   // 1. Image specifies its input, cancellation and returned URL.
   // 2. The nearest host supplies its own implementation.
   // 3. Null preserves today's manual-URL-only form when upload is unavailable.
   export const ImageUploadContext = createContext<
     ((file: File, options: { signal: AbortSignal }) => Promise<string>) | null
   >(null);
   ```

2. Provide the host function directly at the two existing provider sites. Do not add a provider component or a `useImageUpload` wrapper:

   ```tsx
   // Inside EditorLayout or ModulePlayground: uploadImage is host-owned.
   <ImageUploadContext value={uploadImage}>
     {/* Existing editor or playground subtree. */}
   </ImageUploadContext>
   ```

3. The form awaits that function in the existing file-selection/drop event handler. It does not acquire an execution environment:

   ```tsx
   const uploadImage = useContext(ImageUploadContext);

   // Existing validation, controller creation and busy state precede this block.
   const imageUrl = await uploadImage(file, { signal: controller.signal });

   // Cancellation and a newer request must still fence this completion.
   if (controller.signal.aborted || activeUpload.current !== controller) return;
   setDraft((current) => ({ ...(current ?? initialState), imageUrl }));
   // Existing catch/finally retain their matching guards and UI behavior.
   ```

4. Preserve nullable-context behavior. The event handler returns when no uploader is supplied, and the file-picker/drop UI is hidden; manual Image URL entry and Save still work. A missing uploader is an intentional capability choice, not a replacement for an expected upload failure.

## Host implementation and SWR

1. Keep each HTTP body in its current owning component. Both functions use `async`/`await`, forward the supplied signal to `fetch`, parse JSON as `unknown`, and use synchronous Effect Schema decoding at the existing response boundary. Schema imports remain; upload `Effect.fn`, `Effect.tryPromise`, `Effect.fail`, `Effect.provide` and `Effect.runPromise` disappear.
2. App retrieves a fresh token through Clerk's ordinary `getToken()` for every invocation. Preserve the visible `Clerk is offline` and signed-out errors in the upload handler; preserve other request failures for the form's existing error presentation. Keep the existing Effect credential helper and its other callers unchanged. Token acquisition is not abortable, so check the form's signal after awaiting it and before starting HTTP:

   ```tsx
   // Excerpt inside EditorLayout's concrete async uploadImage function.
   const { signal } = options;
   const token = await getToken().catch((cause) => {
     if (ClerkOfflineError.is(cause)) throw new Error("Clerk is offline");
     throw cause;
   });
   signal.throwIfAborted();
   if (token === null) throw new Error("Sign in to upload images");

   // App owns these protocol details; ImageForm does not receive them.
   const body = new FormData();
   body.set("file", file);
   body.set("siteId", params.siteId);
   const response = await fetch(`${apiUrl.replace(/\/$/, "")}/upload`, {
     method: "POST",
     headers: { Authorization: `Bearer ${token}` },
     body,
     signal,
   });
   // Decode the existing success/error schemas here and return uploaded.url.
   ```

3. Storybook owns its anonymous protocol. It adds no credential or site field:

   ```tsx
   // Excerpt inside ModulePlayground's concrete async uploadImage function.
   const { signal } = options;
   const body = new FormData();
   body.set("file", file);
   const response = await fetch("/image/upload", {
     method: "POST",
     body,
     signal,
   });
   // Decode the existing success/error schemas here and return uploaded.url.
   ```

4. Continue decoding `{ key, url, contentType }` on success and `{ code, message }` on an HTTP error, returning the URL or rejecting with the decoded message. Do not replace existing boundary decoding with a cast, move it into ImageForm, or add a shared HTTP adapter merely because the present response shapes match.
5. A host that later wants SWR can implement the same function with `useSWRMutation` and explicit `trigger`. Its argument must carry the form's signal into `fetch`; use no focus/reconnect upload behavior or automatic POST retry. Return a URL on success and reject on failure. Do not supply SWR's hook or mutation object through context, and do not replace the form's per-edit busy/error state with host-wide state. [SWR mutation](https://swr.vercel.app/docs/mutation).
6. SWR `reset()` is not cancellation: it does not abort `fetch`, and an awaiting caller can still receive the resolved value. Preserve the form's AbortController and current-request checks even if a host uses SWR. This cleanup adds no SWR hook or dependency and no upload-starting React effect.

## Behavior that remains

1. Image accepts exactly one nonempty PNG, JPEG, WebP or SVG file of at most 5 MiB. Existing validation messages, picker/drop behavior, pending state and Save gating remain.
2. Upload completion updates only the draft URL. Cancel discards the draft; Save performs the existing model-derived state validation and `onSave`/`updateBrick` command path. The upload operation does not mutate Zerospin models.
3. Cancel and form unmount abort the current controller and invalidate late completions. Retain the existing component-lifetime cleanup effect and BrickDetail's navigation/remount handling. These have an actual lifecycle responsibility; no Effect service or new React effect is required to provide or call `uploadImage`.
4. Request identity guards remain after success, failure and cleanup. A host can fail to honor cancellation or return late; the form must not accept that result into a different edit.
5. Cancellation does not promise rollback of an object already stored by the server. Preserve completed-upload lifetime and public asset GET behavior. Add no asset deletion, compensation or transactional upload/save machinery.
6. Site Settings keeps its current Promise uploader, request validation behavior, busy state and toast presentation. Replace only its token runner with ordinary fresh `getToken()` acquisition and equivalent offline/signed-out feedback. Keep its session for live reads and commands, keep its existing QR-code SWR read, and do not route Site Settings through an Image-specific context.

## Ordered implementation

1. Rename the runtime-context file to `ImageUploadContext.ts` and replace its generic runner value with the function shape above. Update its two providers and one consumer together. Delete `ImageUploadEnvironment.ts` outright; add no forwarding export or compatibility alias.
2. Rewrite the two existing host upload bodies as local async `uploadImage` functions. Remove upload layers, runner adapters and upload-only Effect/Layer imports. Remove only the upload-layer `useMemo` in ModulePlayground; retain the unrelated specs memoization. Keep Clerk hooks at component scope and preserve current route/site ownership.
3. Change ImageForm to call the function directly. Remove its upload `Effect.gen` and service/runtime imports. Retain Schema validation, file validation, draft/busy/error state, controller guards, Cancel and unmount cleanup.
4. Remove `session.runPromise(getClerkToken(...))` from Site Settings' upload handler, using Clerk's Promise API with the same visible offline/signed-out behavior. Remove its now-unused helper import. Keep the shared credential helper, session reads/commands and uploader protocol unchanged.
5. After implementation, update the App and module READMEs and current ownership research. Preserve their unrelated WIP. Update only the superseded upload subsection of active Plan 021 to point here; leave archived Plan 027 and Plan 040 as historical evidence. Reconcile any existing glossary only if an implemented domain meaning changed; none is proposed. No new glossary or ADR is expected for this reversible simplification.
6. Record the actual changes and any unverified behavior in this plan, then archive it under the implementation workflow. Do not describe unrun checks as passed.

## Planned files

`+` creates, `~` modifies, `-` removes. The context replacement is a rename with a narrower value; there is no new provider abstraction.

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
│       │   ├── - ImageUploadEnvironment.ts
│       │   ├── - ImageUploadRuntimeContext.ts
│       │   └── + ImageUploadContext.ts
│       └── lib/
│           └── ~ ModulePlayground.tsx
└── wiki/
    ├── plans/
    │   ├── ~ 021-plan-brick-forms.md
    │   └── + 041-plan-host-owned-upload-functions.md
    └── research/
        ├── + host-owned-image-uploads.md
        └── ~ studio-publishing-ownership.md
```

## Verification policy and existing seams

1. The user declined verification at the end of Plan 040. No builds, tests, browser activity, uploads or failure injection are authorized by this planning turn. Do not automatically restart that browser workflow when implementing this cleanup.
2. If verification is later requested, use the existing authenticated App Image form and anonymous `Modules/Image` Storybook playground. The relevant cases are upload success, visible request/validation failure, cancellation during token acquisition or HTTP, navigation/unmount, late completion suppression, and Save versus Cancel. Inspect the existing requests rather than adding test-only routes, fixtures, runners or provider calls.
3. Existing App and Storybook build targets can check the changed context/call signatures if requested. Build success would not establish authentication, network cancellation or saved-state behavior. This plan adds no new tests and requires no verification machinery.

## Remaining work

1. Review this proposed function/context boundary and host scope, then implement the ordered changes when authorized.
2. Update affected documentation and record the implementation result without claiming unperformed verification.
