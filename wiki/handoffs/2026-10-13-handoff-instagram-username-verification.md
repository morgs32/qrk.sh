# Handoff: Instagram account verification

**Created:** 2026-10-13

**Reconciled:** 2026-11-06

**Status:** Continued in active [Plan 054](../plans/054-plan-instagram-verification.md). Implementation is in progress; local-browser and live personal-account acceptance remain outstanding.

## Settled implementation

1. The App dashboard owns the account-level card below the account/Create site row and above the sites list. Instagram Bricks, scraping, QRK login, and production deployment remain outside scope.
2. A shared `instagramVerification` Service owns challenges and proofs. Its Clerk-authenticated Actor exposes only that subject's rows and start/disconnect commands. A QRK user may verify multiple Instagram accounts; each `(receivingAccountId, senderScopedId)` identity belongs to at most one QRK user until disconnected.
3. Start reserves a cryptographically random code as `issuing` and records an internal System activation command. Only backend activation makes it `pending` and visible to the user. The ten-minute expiry is derived during start; replacement supersedes unfinished attempts.
4. The API verifies Meta's raw-body signature, filters original messages for QRK's fixed professional receiver, and submits the System-only receive command. That command consumes an unexpired pending code and records a server-side profile lookup. Its continuation rechecks the accepted sender/message binding before creating or refreshing a proof.
5. Username is a snapshot of control at verification time. Identity uniqueness uses Meta's scoped sender ID with the receiving account ID. Provider failures preserve existing proofs; disconnect releases the link and invalidates matching resolving work.
6. App has a separate managed verification Service session and SharedWorker. Sign-out clears both Service and User identities before Clerk sign-out, including when a session is loading or failed, using the adopted Zerospin 42.0.4 fix.

## Verification evidence and limits

1. The actual-System backend harness covers the authored success and rejection behavior through Actor/System commands and recorded provider work. The installed harness supports Actor `push`; it does not prove credential authentication, Durable Object delivery, or browser synchronization. The older System-only harness guidance has been corrected.
2. All 24 backend tests, seven focused mocked webhook tests, App/API typechecks, and affected builds pass. Activation coverage includes early DMs, superseded activation, and expiry before activation. No Library tests or live-provider automated tests are used.
3. Meta's documented messaging/profile flow supports the proposed design, but ordinary personal-account delivery still requires the live no-role acceptance test. Simulated payloads and developer/tester access cannot satisfy it. Consult [Meta's maintained Instagram collection](https://github.com/fbsamples/messenger-platform-samples/blob/main/postman/instagram-platform-api.postman_collection.json) and the actual app configuration when determining access requirements.

## Remaining work

1. `@qrk.sh` is a public Business account, Product/service with category display off and no public contact details. Meta app `QRK verification` (`1165998892424227`) is created after the maintainer's terms approval and password re-authentication. Its current Unified Login setup requires a business portfolio; prepare QRK's own rather than selecting an unrelated project's portfolio. Chrome control stopped before opening that form and awaits resumption.
2. Verify current Unified Login token/host, profile lookup, permissions, and webhook compatibility in authenticated Meta documentation before completing private environment configuration. The existing maintained sample covers the older Instagram Login flow and cannot prove compatibility with the new setup. The actual receiving Instagram ID remains unset and is distinct from the Meta app ID.
3. Verify authentication isolation, reload persistence, preparation/pending feedback, disconnect, and account transfer through the existing local origins and `__dev` flow. Complete the live DM round trip from an ordinary personal Instagram account with no Meta role.
4. Use the authorized route-restricted tunnel only for Meta callbacks and stop it after verification. Preserve existing storage and unrelated WIP. Open the QRK ready-for-review PR and archive the plan only after required acceptance is complete.

## Pointers

1. [Active plan and current evidence](../plans/054-plan-instagram-verification.md)
2. [App dashboard](../../apps/app/app/[username]/(dashboard)/page.tsx)
3. [App setup and session ownership](../../apps/app/README.md)
4. [API webhook setup](../../apps/api/README.md)
5. [Service setup](../../apps/zerospin/README.md)
6. [Service release](../../apps/zerospin/src/services/instagramVerification/instagramVerificationV1.ts)
7. [Upstream sign-out fix PR](https://github.com/morgs32/zerospin/pull/127)
