# Host-owned Image uploads

Updated 2026-10-22 for the implemented [Plan 041](../archive/plans/041-plan-host-owned-upload-functions.md) revision. The accepted design uses SWRConfig instead of the initially proposed dedicated React context. Implementation verification was waived by the user; no new checks or runtime evidence are claimed here.

[Plan 042](../archive/plans/042-plan-route-layout-ownership.md) moves the App
host into actual PageLayout while retaining this SWR contract and both HTTP
protocols. UserLayout now owns authentication/initializer readiness directly;
SiteLayout owns the shared shell. Settings forms own local fields and their own
Save/Cancel. No verification was run for that composition change.

The subsequent editor follow-up keeps this ownership unchanged: PageLayout now
owns preview scrolling, drawer space and toolbar placement directly, and its
PagePreview contains the former development canvas inside the production chrome.
The dev URL, WallPreviewViewport and BrickCardStyleContext are removed. App uses
saved `Site.cardStyle` directly; these presentation changes add no upload or
initializer capability. No verification was run for this follow-up.

## Ownership and configuration

App's PageLayout owns authenticated `/upload`, fresh Clerk-token acquisition, the current `siteId`, multipart construction and decoding the untrusted response. Storybook's ModulePlayground owns anonymous `/image/upload` with no token or site field. Each implements an ordinary async function and supplies it through `SWRConfig`; neither needs a Zerospin session. [App host](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx), [Storybook host](../../apps/app/modules/lib/ModulePlayground.tsx).

```tsx
// 1. The host owns HTTP and returns the uploaded URL.
// 2. The existing subtree receives the concrete function through SWR configuration.
<SWRConfig value={{ uploadImage }}>
  {/* Existing editor or playground subtree. */}
</SWRConfig>
```

The optional field has one contract:

```ts
// The form owns the file and cancellation signal; the host returns the URL.
uploadImage?: (file: File, options: { signal: AbortSignal }) => Promise<string>;
```

`ImageUploadSWR.d.ts` augments `PublicConfiguration` through the installed SWR's exported `swr/_internal` entrypoint, preserving its upstream generic declaration. This types both `SWRConfig` and `useSWRConfig()` without casts, wrapper hooks or a separate Image upload context. The accepted trade-off is coupling this type-only extension to that exported configuration interface. No dependency upgrade or installed-package edit is involved. [Augmentation](../../apps/app/modules/image/ImageUploadSWR.d.ts).

The shared registered-form contract remains `state`, `onSave` and `onCancel`; no Image-specific prop travels through the module registry. A missing uploader hides file selection/drop UI while keeping manual Image URL entry and Save available. [ImageForm](../../apps/app/modules/image/ImageForm.tsx), [Form contract](../../apps/app/modules/lib/types.ts).

## Form-local mutation

SWRConfig carries the function; ImageForm still explicitly supplies the mutation implementation. `useSWRMutation` starts only when a file-selection/drop handler calls `trigger`. Request pending/error state belongs to this hook, while file validation errors, save errors and unsaved drafts remain local form state. Revalidation and cache population are disabled because uploading is separate from persisting the Brick state. [SWR: mutation](https://swr.vercel.app/docs/mutation), [ImageForm](../../apps/app/modules/image/ImageForm.tsx).

```tsx
const { uploadImage } = useSWRConfig();
const { trigger, isMutating, error, reset } = useSWRMutation(
  "image-upload",
  (_key, props: { arg: { file: File; signal: AbortSignal } }) => {
    const { arg } = props;
    if (uploadImage === undefined) throw new Error("Image upload is unavailable");
    // 1. The mutation explicitly delegates to this host's function.
    return uploadImage(arg.file, { signal: arg.signal });
  },
  // 2. The operation does not refresh or populate an SWR read cache.
  { revalidate: false, populateCache: false, throwOnError: true },
);
```

SWR does not replace transport cancellation. Installed SWR 2.4.1 passes `{ arg }` to the mutation fetcher; the form puts its signal in that argument. `reset()` clears local mutation state and discards older state updates, but does not call `AbortController.abort()`. A discarded successful mutation can still return data to an awaiting caller. Consequently, the form retains both transport aborts and request-identity guards before accepting the URL. Reset occurs when starting a new upload attempt, saving or cancelling. [Installed trigger/reset implementation](../../apps/app/node_modules/swr/dist/mutation/index.mjs), [Installed fetcher types](../../apps/app/node_modules/swr/dist/mutation/index.d.ts).

## Removed execution machinery

1. Deleted the `ImageUploadEnvironment` Effect service and `ImageUploadRuntimeContext` generic runner context.
2. Removed both host upload layers, `Effect.provide`/`Effect.runPromise` adapters and Storybook's upload-layer memoization.
3. Replaced ImageForm's `Effect.gen` service lookup with `trigger({ file, signal })`.
4. Retained Effect Schema decoding at both hosts' existing response boundaries, using synchronous decoding in their async functions.
5. Removed Site Settings' upload-token call through `session.runPromise`. Its ordinary Promise uploader now gets a fresh Clerk token directly, preserving offline/signed-out feedback. Its session still owns reads/commands; the shared Effect credential helper remains for Zerospin authentication. [Site Settings](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx), [Credential helper](../../apps/app/lib/getClerkToken.ts).

## Lifecycle and persistence

BrickDetail resolves the Placement from the production URL's `breakpoint`
search and keys its form by that Placement identity and the existing reset epoch.
Changing breakpoint, including the PageLayout guard's automatic URL correction,
unmounts the previous form, discards its draft and aborts its upload. This replaces
the earlier retained-upload behavior across breakpoint changes. Settings forms
remain keyed by Site/Page identity and are not reset by breakpoint selection.

Upload begins in the interaction handler; no React effect installs or starts it. The existing component-lifetime cleanup remains responsible for aborting on unmount. Cancel separately aborts transport, invalidates the active request and resets SWR state. These lifecycle guards remain necessary even when a host ignores cancellation. [React: interaction-driven requests](https://react.dev/learn/you-might-not-need-an-effect), [Form lifecycle](../../apps/app/modules/image/ImageForm.tsx).

App checks the signal after awaiting Clerk's non-abortable token acquisition and before starting HTTP. Both hosts pass the signal to `fetch` and retain their existing success/error schemas. A successful upload changes only the draft URL; Save validates the complete Image state and uses the existing callback/command path. Cancel discards the draft. Aborting cannot promise rollback of an object already stored by the server, so completed R2 objects and public asset GET behavior keep their existing lifetime. [App host](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx), [Recorded upload ownership](studio-publishing-ownership.md#implemented-follow-up-host-owned-image-uploads).
