# ImageForm authenticated uploads

Researched 2026-10-13 against current QRK source, installed Clerk 7.1.0 declarations, and official Clerk/React documentation. This is a design finding; no implementation or plan changes were made.

## Answer

Yes. `ImageForm` can own the entire upload operation while receiving the current application's upload environment through an image-owned React context. Studio supplies access to its Clerk token; the form retrieves that token when uploading and sends the existing bearer-authenticated request. React context can carry objects/functions through intermediate components without adding props to those components. This ownership recommendation is an inference applied to QRK's two existing environments. [React useContext](https://react.dev/reference/react/useContext), [Clerk authenticated requests](https://clerk.com/docs/guides/development/making-requests).

## Verified current behavior

- `ImageForm` already owns file selection, file checks, its active `AbortController`, error display, and updating `imageUrl`. Its host owns the network operation and SWR pending state, passed as `uploadImage` and `isUploadingImage`. [ImageForm](/Users/morgs32/GitHub/qrk.sh/apps/library/modules/image/ImageForm.tsx:7), [Studio upload operation](/Users/morgs32/GitHub/qrk.sh/apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickDetail/BrickDetail.tsx:50), [Library upload operation](/Users/morgs32/GitHub/qrk.sh/apps/library/app/bricks/[brickId]/page.tsx:37).
- Studio's component tree is beneath `ClerkProvider`; its upload operation calls `useAuth().getToken()` and posts multipart data to `${NEXT_PUBLIC_API_URL}/upload` with `Authorization: Bearer …`. Clerk documents this token/header mechanism for cross-origin requests. [Studio provider](/Users/morgs32/GitHub/qrk.sh/apps/studio/app/App.tsx:13), [Studio request](/Users/morgs32/GitHub/qrk.sh/apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickDetail/BrickDetail.tsx:59), [Clerk useAuth](https://clerk.com/docs/nextjs/reference/hooks/use-auth).
- Standalone Library has no Clerk provider and no declared Clerk dependency. It posts anonymously to `/image/upload`, rewritten to the API Worker. An unconditional `useAuth()` inside this shared form would therefore require changing Library's authentication environment. Clerk requires its provider to supply hook context. [Library root](/Users/morgs32/GitHub/qrk.sh/apps/library/app/layout.tsx:10), [Library layout](/Users/morgs32/GitHub/qrk.sh/apps/library/app/LibraryLayout.tsx:99), [Library dependencies](/Users/morgs32/GitHub/qrk.sh/apps/library/package.json:80), [Library rewrite](/Users/morgs32/GitHub/qrk.sh/apps/library/next.config.ts:26), [ClerkProvider documentation](https://clerk.com/docs/nextjs/reference/components/clerk-provider).
- The Worker authenticates `/upload` and deliberately skips authentication for `/image/upload`. Its current auth helper accepts a bearer header only. `siteId` is optional object-key grouping, defaulting to `_`; it is syntax-checked when supplied and is not checked against ownership of a site. [Worker routing](/Users/morgs32/GitHub/qrk.sh/apps/api/Worker.ts:61), [Bearer auth](/Users/morgs32/GitHub/qrk.sh/apps/api/http.ts:34), [Upload grouping](/Users/morgs32/GitHub/qrk.sh/apps/api/handleUpload.ts:54).

## Proposed image-owned seam

One image context could carry this inline shape:

```ts
{
  uploadUrl: string;
  getToken: (() => Promise<string | null>) | null;
  siteId: string | null;
}
```

Studio would configure it beneath Clerk and the relevant site/page layout using the API `/upload` endpoint, Clerk's `getToken`, and the current site ID. Library would configure its standalone layout using `/image/upload`, `getToken: null`, and `siteId: null`. Those values describe existing behavior; this is proposed wiring, not an existing API. [Current Studio values](/Users/morgs32/GitHub/qrk.sh/apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickDetail/BrickDetail.tsx:59), [Current Library values](/Users/morgs32/GitHub/qrk.sh/apps/library/app/bricks/[brickId]/page.tsx:43).

The form would own multipart construction, conditional bearer-header attachment, response decoding, SWR mutation state, cancellation, and writing the returned URL into its draft. If a configured token getter returns `null`, it must fail as signed out rather than use the anonymous route. This removes image upload behavior and pending state from the generic module-form contract while keeping app-specific credentials/configuration in the apps. It requires no Clerk dependency in Library. These are design recommendations, grounded in the current operation and contract. [Studio upload](/Users/morgs32/GitHub/qrk.sh/apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickDetail/BrickDetail.tsx:54), [Generic form contract](/Users/morgs32/GitHub/qrk.sh/apps/library/make/makeModuleView.tsx:188).

Implementation would require approval for the new context abstraction under this repository's working rules. The context's provider and reader must share the same context object across Library's package build; React documents that duplicate module objects break context. [AGENTS.md](/Users/morgs32/GitHub/qrk.sh/AGENTS.md:14), [React context caveats](https://react.dev/reference/react/useContext#caveats).

## Same-origin alternative

A shared same-origin upload path could keep Clerk out of the form entirely: Studio's route handler would read its Clerk session and forward the upload with a bearer token; Library would retain its anonymous API rewrite. Clerk documents automatic session-cookie inclusion for same-origin requests. QRK's existing Worker does not read that cookie, and Studio has no upload rewrite, so a plain `fetch('/upload')` does not currently provide this behavior. This alternative adds server-side routing/authentication work; the context approach reuses the existing bearer transport. [Clerk authenticated requests](https://clerk.com/docs/guides/development/making-requests), [Worker token extraction](/Users/morgs32/GitHub/qrk.sh/apps/api/http.ts:34), [Studio rewrites](/Users/morgs32/GitHub/qrk.sh/apps/studio/next.config.ts:21).

## Configuration caveats

Authenticated requests remain subject to the API Worker's CORS origins and Clerk `authorizedParties`; the current verifier receives one configured party. Moving network ownership into the form alone does not change those settings. [API CORS and verification](/Users/morgs32/GitHub/qrk.sh/apps/api/http.ts:1), [Local authorized party](/Users/morgs32/GitHub/qrk.sh/apps/api/wrangler.jsonc:21).

Installed Clerk 7.1.0 also exports a top-level browser `getToken()`, so a React hook is not fundamentally necessary for token retrieval. Its official implementation waits for an initialized Clerk instance and throws after ten seconds if it never loads; it cannot manufacture an authenticated session for standalone Library. The context proposal avoids relying on a browser global or adding Clerk to Library. [Installed public export](/Users/morgs32/GitHub/qrk.sh/apps/studio/node_modules/@clerk/nextjs/dist/types/index.d.ts:16), [Official getToken source](https://github.com/clerk/javascript/blob/main/packages/shared/src/getToken.ts).
