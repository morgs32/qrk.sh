# Host-owned Image uploads

Research for the upload cleanup plan, 2026-10-22. These are source findings and a proposed seam; no implementation or runtime verification was performed.

## Current ownership

App's `EditorLayout` already owns authenticated `/upload`, fresh Clerk-token acquisition, the current `siteId`, multipart construction, and decoding the untrusted response. Storybook's `ModulePlayground` owns anonymous `/image/upload` with no token or site field. Each currently constructs an `ImageUploadEnvironment` Effect layer, then exposes a generic `runPromise` adapter through `ImageUploadRuntimeContext`. Neither operation needs a Zerospin session. [App host](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/EditorLayout.tsx:60), [Storybook host](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/ModulePlayground.tsx:50), [Service](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/image/ImageUploadEnvironment.ts), [Runtime context](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/image/ImageUploadRuntimeContext.ts).

`ImageForm` owns file validation, draft state, busy/error feedback, an `AbortController`, Cancel/unmount cancellation, and rejection of stale completions. Its upload success only changes the draft URL; Save separately validates and invokes the existing save callback. The form currently wraps a service lookup in `Effect.gen` solely to obtain that URL. [ImageForm](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/image/ImageForm.tsx:15).

## Proposed boundary

Expose one concrete asynchronous operation to the form:

```ts
// 1. The Image module supplies a file and a request-scoped cancellation signal.
// 2. The host performs its own upload protocol and returns the uploaded URL.
uploadImage: (file: File, options: { signal: AbortSignal }) => Promise<string>;
```

The host may implement this with ordinary `async`/`await`, SWR, or its own internal Effect code. The module-facing contract does not expose the host's library, transport configuration, token, site, generic runner, or service environment. This is a recommendation based on the two existing callers and their current return value. [Current service contract](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/image/ImageUploadEnvironment.ts), [App caller](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/EditorLayout.tsx:60), [Storybook caller](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/ModulePlayground.tsx:50).

One ordinary React context can carry that function through the routed editor tree. React context accepts any value and makes the nearest provider's value available to descendant consumers. A context default of `null` can preserve today's manual-URL-only form where no upload operation is supplied. There is no need to add Image-specific props to every registered module form or involve an initializer. [React: createContext](https://react.dev/reference/react/createContext), [React: passing data deeply](https://react.dev/learn/passing-data-deeply-with-context), [Current optional upload UI](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/image/ImageForm.tsx:124).

## SWR is an optional host implementation

The relevant SWR API is `useSWRMutation`: requests begin when `trigger` is called. It exposes mutation state and supports cache coordination; ordinary `useSWR` is designed to fetch automatically. A host could adapt `trigger({ file, signal })` to the Promise operation above. For this upload endpoint there is no existing read resource to refresh, so an SWR implementation should disable revalidation. Cache population is already disabled by default. [SWR: mutation](https://swr.vercel.app/docs/mutation).

SWR **does not replace transport cancellation**. Installed SWR 2.4.1 calls the fetcher with `{ arg }`; its mutation API supplies no automatic `AbortSignal`. Its `reset()` advances a timestamp and clears local mutation state, but never calls `AbortController.abort()`. A discarded successful mutation still returns its resolved data to the awaiting caller. Consequently, `ImageForm` must continue checking its signal and active request before accepting the returned URL, even when the host uses SWR. Put the form's signal inside the mutation argument and pass it to `fetch`. [Installed fetcher types](/Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/swr/dist/mutation/index.d.ts:3), [Installed trigger implementation](/Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/swr/dist/mutation/index.mjs:89), [Installed reset implementation](/Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/swr/dist/mutation/index.mjs:142), [Installed version](/Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/swr/package.json:3).

For this cleanup, direct host-owned async functions are sufficient: the form already owns per-edit busy/error state and cancellation, and uploaded URLs are not currently an SWR read cache. Introducing an SWR hook solely to recreate those responsibilities would add an adapter without removing the form's guards. Hosts remain free to adopt SWR when they need its state/cache behavior. This is a recommendation, rather than an SWR requirement. [Current form state](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/image/ImageForm.tsx:23), [SWR: mutation state and cache](https://swr.vercel.app/docs/mutation).

## What can disappear

1. Delete `ImageUploadEnvironment` and its `Context.Service` declaration.
2. Replace `ImageUploadRuntimeContext`'s generic Effect runner with the concrete Promise function context.
3. Remove both upload-only `Layer.succeed` blocks, both `Effect.provide`/`Effect.runPromise` adapters, and Storybook's upload-layer `useMemo`.
4. Replace the form's `Effect.gen` service lookup with `await uploadImage(file, { signal: controller.signal })`.
5. Rewrite the two host upload bodies as ordinary async functions if the agreed goal is to remove their upload-only `Effect.fn`, `Effect.tryPromise`, and failure mapping. Retain response decoding at each host's existing untrusted boundary. Effect Schema can remain without an Effect runtime or layer. These are planned removals from the cited source, not a proposal to remove Effect from unrelated workflows. [App host](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/EditorLayout.tsx), [Storybook host](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/ModulePlayground.tsx), [ImageForm](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/image/ImageForm.tsx).

## Lifecycle that remains

Starting the upload belongs in the file-selection/drop event handler. React specifically recommends handling interaction-caused requests in event handlers. No React Effect is needed to start an upload or install the context value. [React: you might not need an Effect](https://react.dev/learn/you-might-not-need-an-effect).

Cancel and leaving the form must still abort pending transport work and suppress late completions. The existing cleanup is a genuine component-lifetime responsibility. React runs cleanup when a component unmounts; choosing a cleanup hook is separate from eliminating the Effect library's upload service/runtime. `useLayoutEffect` performs synchronous commit work and blocks painting; changing the existing cleanup hook should have an explicit lifecycle reason, rather than be bundled into the service removal. [React: useEffect](https://react.dev/reference/react/useEffect), [React: useLayoutEffect](https://react.dev/reference/react/useLayoutEffect), [Current cleanup and stale-result guards](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/image/ImageForm.tsx:34).

Aborting an HTTP request cannot promise that the server has not already stored the object. Preserve the existing distinction between upload completion, unsaved draft changes, and saving the brick; do not introduce asset deletion or transaction/rollback behavior as part of this cleanup. [Recorded upload lifetime](/Users/morgs32/GitHub/qrk.sh/wiki/research/studio-publishing-ownership.md:22).
