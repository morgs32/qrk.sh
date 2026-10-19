# Local Next.js subdomain routing proof

Status: Complete. Standard HTTPS on port 443, wildcard routing, development WebSockets, sign-in, and authenticated API access verified on October 18, 2026.

## Goal and agreed behavior

1. Prove local hostname routing before connecting a site query. Portless forwards `https://alpha.qrk.localhost/` and `https://beta.qrk.localhost/about` to Web on port 3000; Next renders the selected subdomain and remaining path.
2. Accept one DNS label before `.qrk.localhost` in development only. `alpha` and `beta` are arbitrary proof values, not Site slugs or usernames. Real site identity and uniqueness remain a later decision.
3. Preserve the visible hostname, path, and query string during rewrites and Next Link navigation. Proof requests require no sign-in and issue no QRK backend query.
4. Keep ordinary `localhost:3000` routing, authentication, Studio forwarding, and existing static/API routes. Retain the current root layout and providers.
5. Keep scope to the routing proof: no site renderer, models, contracts, generated fixtures, Studio public-link changes, deployment/DNS configuration, repository dependencies, or test suites.

## Decisions and rationale

1. Use Portless as a separate local CLI with a wildcard alias to the existing fixed port. Keep Nx commands, package scripts, lockfile, `APP_ORIGIN`, and `next.config.ts` unchanged. Automatic monorepo discovery or random backend ports would add unrelated runtime changes.
2. Let the exported Web Proxy own hostname dispatch. Keep the current `clerkMiddleware(...)` expression and callback as `clerkProxy`, called only by the ordinary-request fallback. This is necessary because Clerk can authenticate and redirect before invoking its callback; adding the rewrite inside that callback would not bypass its handshake.
3. Read the preserved `Host` header, lowercase it, remove an optional numeric port, and match exactly one valid DNS label before `.qrk.localhost`. Do not use forwarded-host headers or introduce a host resolver, named type, or shared routing abstraction.
4. Clone `request.nextUrl` and change only its pathname. Use the existing static-file matcher; additionally exclude `/api`, `/trpc`, and `/rpc` and their descendants from hostname dispatch. Keep RSC and prefetch requests eligible for the same rewrite as ordinary page requests.
5. Use one explicit internal route, `/subdomain-proof/[subdomain]/[[...path]]`, rather than a root catch-all that could intercept Studio routes. Guard its page with development mode and a matching request hostname; direct base-host access must not render proof content. Next already allows `**.localhost` for development assets, so add no `allowedDevOrigins` setting.
6. The approved October 18 HTTPS follow-up pins the repository's Portless monorepo startup to standard HTTPS port 443. Update development public URLs, local environment values, CORS origins, and Clerk authorized parties to omit `:1355`; preserve fixed internal ports, the existing CA, production configuration, and all existing browser/backend data. This supersedes the standalone startup arrangement in decision 1. Startup-script simplification occurred separately in the main chat; this HTTPS migration preserves that work, and the root README documents the current startup interface.

Evidence: [research and primary sources](../../research/nextjs-subdomain-routing.md), [current Proxy](../../../apps/web/proxy.ts), and [current rewrites](../../../apps/web/next.config.ts). No existing ADR governs this proof.

## Implementation steps

1. Provision Portless separately if absent and record the installed version. Reuse an existing compatible proxy, otherwise start its default local HTTPS proxy with wildcard routing and register the `qrk` alias to port 3000. Inspect existing registrations before changing them; do not force-replace another route. Initial CA trust and binding port 443 may require an interactive administrator action; complete that prerequisite before claiming HTTPS works.
2. Update `apps/web/proxy.ts` with the development-only hostname branch before `clerkProxy`. Match page requests only (`GET`/`HEAD`), retaining all current matcher exclusions and the reserved endpoints above. Rewrite recognized requests to `/subdomain-proof/${subdomain}${pathname}`. Fall through to the existing Clerk handler with the original request and event for every other request.
3. Add the async Server Component page with inline `params: Promise<{ subdomain: string; path?: string[] }>` props. Destructure `props` first, await `params`, and return `notFound()` outside development or when the request hostname differs from `${subdomain}.qrk.localhost`. Render plain text for the subdomain and `/${(path ?? []).join("/")}`, plus Next Links to `/` and `/about`. Keep the logic in this page; add no client state, data loader, or session.
4. Reuse running dev processes or start Web through its existing Nx target. Start Studio through its existing Nx workflow only if needed for the base-host routing smoke check. Preserve existing data, login state, origins, and unrelated WIP.
5. Perform the manual verification below, reconcile affected documentation, and archive this plan only when the proof and required verification are complete.

```sh
# 1. Install the standalone tool if absent; leave repository manifests alone.
npm install -g portless

# 2. Run Web through its existing target, retaining port 3000.
pnpm nx run @qrk.sh/web:dev

# 3. In another terminal, route the base name and its wildcard children to Web.
portless proxy start --wildcard
portless alias qrk 3000
portless list
```

The routing excerpt below belongs to the exported Proxy after the development,
hostname, method, and reserved-path checks. `clerkProxy` is the existing Clerk
middleware, not a replacement authentication implementation.

```ts
// 1. Change only the pathname so the request origin and query survive.
if (subdomain) {
  const destination = request.nextUrl.clone();
  destination.pathname = `/subdomain-proof/${subdomain}${pathname}`;
  return NextResponse.rewrite(destination);
}

// 2. Ordinary requests retain the existing Clerk and Studio routing behavior.
return clerkProxy(request, event);
```

Annotated examples:

1. `https://alpha.qrk.localhost/` renders `Subdomain: alpha` and `Path: /`. The browser continues to show the public URL, without `/subdomain-proof`.
2. `https://beta.qrk.localhost/about/team?from=proof` renders `Subdomain: beta` and `Path: /about/team`; `?from=proof` remains on the rewritten request and in the browser URL.
3. `http://localhost:3000/morgs32` follows the existing authentication and Studio flow. A hostname with multiple labels before `.qrk.localhost` is outside this proof and follows the existing fallback.

## Planned files

Legend: `+` create; `~` modify. The research note already exists; update its runtime evidence after implementation.

```text
qrk.sh/
├── ~ README.md
├── apps/web/
│   ├── ~ proxy.ts
│   └── app/subdomain-proof/[subdomain]/[[...path]]/
│       └── + page.tsx
└── wiki/
    ├── plans/
    │   └── + 024-plan-nextjs-subdomain-routing.md
    └── research/
        └── ~ nextjs-subdomain-routing.md
```

## Manual verification and completion

1. Use the existing Chrome profile and preserve its localhost tabs and login. Require a trusted HTTPS connection for alpha/beta, successful document responses, correct subdomain/path text, no sign-in or handshake loop, and no QRK backend query. Verify both hosts, a nested path, a query string, and a reload.
2. Follow the page's `/` and `/about` Next Links, then browser Back/Forward. Confirm the host stays selected, displayed path changes correctly, and no internal rewrite prefix leaks into visible URLs. Inspect CSS/JS requests and a small development edit for working assets and HMR.
3. Recheck the ordinary localhost homepage and existing signed-in dashboard/Studio route. Inspect the base `qrk.localhost` homepage as well, without moving existing authenticated work to that new origin. Confirm asset paths and reserved API/RPC paths are not rewritten into the proof page, and direct base-host proof URLs never render proof content.
4. Verify the dev-only guards by source review. Use Next's development compilation and the manual HTTP/browser checks above; do not add or require a test suite, backend integration test, or standalone check gate. Record observed results and exact unresolved blockers separately from source-verified capabilities.
5. Update README startup/trial instructions and the research note with actual versions and verification evidence. Leave the working alias available for review; document `portless alias --remove qrk` and stopping a proxy started solely for this trial as optional cleanup. Do not remove shared Portless state, trust, or unrelated registrations.
6. Reconcile the existing glossary only if implementation introduces a real domain term; none is expected for arbitrary proof hostnames. Create an ADR only for an implemented decision that is hard to reverse, surprising without context, and the result of a real trade-off; none is anticipated. Record the result, set Remaining work to None, and move this plan to `wiki/archive/plans/` with its filename and links preserved.

## Verification evidence

1. Added the exported hostname dispatcher and the guarded proof page. The ordinary Clerk callback, Next rewrites, root providers, package manifests and lockfile were preserved. No named type, shared helper, query or test suite was added. Source review confirms development-only dispatch and rendering.
2. Installed standalone Portless 0.15.8 on Node 24.13.1. CA trust succeeded; `portless doctor` reports zero failures/warnings. Port 443 startup required a sudo password unavailable to the noninteractive process and fell back to 1355. Restarted that listener explicitly with HTTPS and wildcard mode; `qrk.localhost` aliases port 3000.
3. Existing Chrome profile verified alpha `/`, beta `/about/team?from=proof`, reload, Next Links, and Back/Forward. Visible host/path/query remain intact. Beta's document has HTTP/2 200 and Chrome security state `secure`; captured fonts/CSS/JS/favicon return 200, no network loads fail, and no QRK backend query is issued. HMR over WSS applied a temporary heading edit and its restoration without navigation. Screenshot: `/tmp/qrk-subdomain-proof.png`.
4. Base localhost and Portless homepages return 200. Existing Google sign-in returns to `/morgs32` and reaches the authenticated Studio shell. Authenticated direct base-host proof access returns 404; reserved API/RPC paths keep their existing sign-in behavior. Studio data loading remains blocked by the unrelated existing Zerospin `zerospin-dev-system-spec-check-failed` error during startup; backend health is not claimed and no storage was reset.
5. README and research now record setup, evidence, cleanup and the port 443 prerequisite. No new domain term was introduced, so the existing glossary needs no change; this reversible local proof warrants no ADR. Code remains ready for review; no repository tests or standalone check gates were introduced or run.
6. October 18: root startup pins `PORTLESS_PORT=443`; active application URLs, API defaults/CORS, local Clerk authorized parties, Studio endpoints, environment examples, and startup documentation omit the nonstandard port. Existing local environment files were updated without exposing credentials. This migration changed no internal port, production setting, local data, or installed service. The initial noninteractive sudo attempt failed; the user completed Portless's normal administrator authentication and started the replacement HTTPS wildcard proxy.
7. Stopped only the old port 1355 listener and started the stack once with root `pnpm dev`. All five servers reached their actual ready messages; Zerospin reported `system spec accepted`. `portless list` shows `qrk`, `studio.qrk`, `library.qrk`, `api.qrk`, and `zerospin.qrk` on HTTPS without an explicit port, forwarding to 3000, 3001, 4100, 8787, and 8788. No port 1355 listener remains. The CLI stop command requested sudo, so the identified user-owned process explicitly listening on 1355 was stopped with SIGTERM; the port 443 proxy remained running.
8. Trusted curl checks on all five hostnames report TLS verification result 0. Web `/`, Library `/`, and Studio `/morgs32` return 200. API `/` returns its expected 404 and Zerospin `/` returns its expected 400; neither is treated as a frontend page. Existing Chrome sign-in through `https://qrk.localhost` returns to `/morgs32` and loads the user's existing site list. The first attempt overlapped a development Worker reload and displayed `node-subscription-closed`; one page reload after Worker readiness completed synchronization successfully.
9. API preflight from `https://qrk.localhost` returns 204 with that exact allowed origin. An authenticated empty multipart POST to `/upload` returns `400 missing-file`, proving Clerk authorization passed before file validation. The corresponding unsigned request returns `401 missing-authorization`. The session token stayed inside the browser and was not printed; neither request created an uploaded object.
10. Chrome verifies alpha root, About navigation, Back/Forward, and beta `/about/team?from=proof` including reload. Hostname, path, and query remain public and have no internal rewrite prefix or explicit port. Captured local documents, fonts, CSS, scripts, and navigation requests have successful HTTP/2 responses. `wss://alpha.qrk.localhost/_next/hmr` and `wss://qrk.localhost/studio-static/_next/hmr` complete HTTP/2 WebSocket handshakes and receive messages with no frame errors. Screenshot of the loaded authenticated dashboard: `/tmp/qrk-https-443-dashboard.png`.

## Remaining work

None.
