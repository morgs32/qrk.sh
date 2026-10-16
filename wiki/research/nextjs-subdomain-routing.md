# Next.js subdomain routing and Portless

Researched against QRK source and official upstream sources on 2026-10-16.
This is a local routing proof; site queries and hostname identity remain outside
the proof. Portless source was inspected at commit
[`27598545f08f8055cb3b9fb410f8d250f054f46d`](https://github.com/vercel-labs/portless/tree/27598545f08f8055cb3b9fb410f8d250f054f46d).

## Current QRK boundary

Web runs Next.js 16.3.4 on port 3000. Its existing Proxy wraps Clerk authentication;
`/` is public, while most other paths require authentication. Existing rewrites
send Studio assets and unmatched routes to port 3001 by default.
[Web package](../../apps/web/package.json),
[Proxy](../../apps/web/proxy.ts),
[Next configuration](../../apps/web/next.config.ts).

Next.js supports host-conditioned rewrites and captured host parameters.
Its Proxy runs before configuration rewrites, so a rewrite alone does not make
an authenticated nested path public. The installed version's host matcher reads
`Host`, removes its port, and lowercases it.
[Rewrite configuration and ordering](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites),
[Next.js 16.3.4 host matching](https://github.com/vercel/next.js/blob/v16.3.4/packages/next/src/shared/lib/router/utils/prepare-destination.ts).

For a proof covering a subdomain plus arbitrary path, the exported Proxy can
identify a local hostname and return `NextResponse.rewrite()` before calling the
existing Clerk middleware. Clerk can authenticate and return a handshake redirect
before invoking its callback, so putting the proof inside that callback would not
fully bypass Clerk processing. Keep the existing Clerk handler for ordinary hosts,
and keep static assets and Next internals excluded. Next's
rewrite API preserves the required RSC routing headers; manually fetching the
destination is unnecessary. App Router parameters are promises, including those
on dynamic and optional catch-all routes.
[Proxy API](https://nextjs.org/docs/app/api-reference/file-conventions/proxy),
[Dynamic route segments](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes),
[Installed Clerk pre-callback authentication](../../apps/web/node_modules/@clerk/nextjs/dist/esm/server/clerkMiddleware.js#L106-L144).

No `allowedDevOrigins` change is needed for `.localhost`: Next.js 16.3.4 already
allows `localhost` and `**.localhost`. This is independent of whether QRK has a
route for the hostname. The reserved `.localhost` namespace is intended to
resolve to loopback.
[Installed-version dev-origin implementation](https://github.com/vercel/next.js/blob/v16.3.4/packages/next/src/server/lib/router-utils/block-cross-site-dev.ts),
[RFC 6761 section 6.3](https://datatracker.ietf.org/doc/html/rfc6761#section-6.3).

## Portless fit

Portless can alias an existing fixed-port server. Starting its proxy with
`--wildcard` lets unregistered child hostnames fall back to the most specific
registered parent. Thus one `qrk` alias can receive both
`alpha.qrk.localhost` and `beta.qrk.localhost` without changing Nx or dev scripts.
The source package currently declares Node.js 24+.
[Commands and wildcard mode](https://github.com/vercel-labs/portless#subdomains),
[Package requirements](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/package.json).

Source inspection confirms the original HTTP/1.1 `Host` is copied to the backend.
For HTTP/2, Portless restores `Host` from `:authority` after removing pseudoheaders.
It connects to the selected loopback port without substituting that address for
the browser hostname. It also supplies `X-Forwarded-Host` and
`X-Forwarded-Proto`, retaining supplied values when present. QRK can match the
original `Host`; this proof does not require trusting forwarded-host headers.
[Host forwarding and route selection](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/src/proxy.ts#L135-L153),
[HTTP/2 Host restoration](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/src/proxy.ts#L361-L390).

HTTPS is the default. Portless creates and trusts a local CA on first use;
binding port 443 can request elevation. Its default certificate alone is not the
basis for nested-host support: the SNI callback generates a certificate containing
the exact requested hostname, including names such as `alpha.qrk.localhost`.
Custom certificates would need their own matching names.
[Default HTTPS setup](https://github.com/vercel-labs/portless#run-your-app),
[Per-host certificate generation](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/src/certs.ts#L758-L794),
[SNI certificate callback](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/src/certs.ts#L842-L954).

## Recommended bounded trial

Use Portless as an optional front door to the existing Web process. Keep the
hostname examples provisional. Install the CLI separately if adopting this trial;
do not replace the repository's monorepo runner or add a project dependency.

```sh
# After starting Web through its existing Nx workflow on port 3000:
portless proxy start --wildcard
portless alias qrk 3000
portless list
```

Implement only a public local proof page that echoes the subdomain and requested
path. Visit `https://alpha.qrk.localhost/` and
`https://beta.qrk.localhost/about`; verify distinct subdomain values, preserved
browser URLs, client navigation, and asset loading. The base host should retain
normal Web/Studio behavior. Neither route should issue a site query.

After the trial, remove the temporary alias with `portless alias --remove qrk`;
stop the proxy if it was started only for this trial. Portless also writes local
state and normally syncs registered hostnames into `/etc/hosts`. Chrome resolves
`.localhost` subdomains directly; Safari can depend on system resolution, and
unregistered wildcard children require separate DNS consideration there.
[Alias and proxy commands](https://github.com/vercel-labs/portless#commands),
[DNS behavior](https://github.com/vercel-labs/portless#safari--dns).

## Runtime evidence, 2026-10-16

1. Installed standalone Portless **0.15.8** with Node **24.13.1**, registered
   `qrk.localhost -> localhost:3000`, and started its HTTPS wildcard listener on
   **1355**. Initial port 443 startup could not obtain an interactive sudo
   password and automatically fell back. `portless doctor` reports zero failures
   and zero warnings, including OS CA trust. Repository dependencies and Nx
   scripts were not changed.
2. Implemented the exported Proxy dispatch before Clerk and the development-only
   guarded echo page. Ordinary hosts keep the existing Clerk handler. Authenticated
   access to `localhost:3000/subdomain-proof/alpha` returns the expected 404.
   [Proxy](../../apps/web/proxy.ts),
   [Page](../../apps/web/app/subdomain-proof/[subdomain]/[[...path]]/page.tsx).
3. In the existing Chrome profile, alpha's root and beta's
   `/about/team?from=proof` display the correct subdomain and path with no sign-in
   redirect or internal prefix in the address bar. Next Link navigation and
   Back/Forward preserve the subdomain. Beta's reload returns HTTP/2 200 with
   Chrome security state `secure`; the rewrite header preserves `?from=proof`.
4. Browser network capture records HTTP 200 for Web CSS, JavaScript, fonts and
   favicon, with no loading failures and no QRK backend query. HMR opens
   `wss://beta.qrk.localhost:1355/_next/hmr`; a temporary heading edit appeared
   without navigation and its restoration appeared the same way. The retained
   ClerkProvider loads successfully; console output contains only Clerk's
   development-key warning. Screenshot: `/tmp/qrk-subdomain-proof.png`.
5. Both localhost's and Portless's base-host homepages return HTTP 200. Reserved
   `/api/proof` and `/rpc/proof` on the alpha Host retain the existing unauthenticated
   sign-in redirect instead of becoming echo pages. Existing Google sign-in
   returns to `/morgs32` and reaches Studio's authenticated shell. Dashboard data
   remains at `Loading account`: the existing Zerospin dev process rejected its
   stored system spec with `zerospin-dev-system-spec-check-failed` during the Nx
   startup graph. No backend state was reset or repaired by this proof.
6. **Still required:** start the planned port 443 listener from an interactive
   terminal, then recheck the clean HTTPS URLs without `:1355`. The routing proof
   on 1355 is verified; port 443 is not. [Active plan](../plans/024-plan-nextjs-subdomain-routing.md).
