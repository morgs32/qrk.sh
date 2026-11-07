# Handoff: Instagram account verification

**Created:** 2026-10-13

**Reconciled:** 2026-11-06

**Status:** Continued in active [Plan 054](../plans/054-plan-instagram-verification.md). Implementation checks pass. The maintainer set both administrator invitations aside while app ownership is investigated. The app-admin Business ID flow is visible, but Connect remains disabled and no request was issued. Browser network diagnostics await resumption. QRK app ownership, receiver authorization, local-browser and live personal-account acceptance remain outstanding.

## Settled implementation

1. The App dashboard owns the account-level card below the account/Create site row and above the sites list. Instagram Bricks, scraping, QRK login, and production deployment remain outside scope.
2. A shared `instagramVerification` Service owns challenges and proofs. Its Clerk-authenticated Actor exposes only that subject's rows and start/disconnect commands. A QRK user may verify multiple Instagram accounts; each `(receivingAccountId, senderScopedId)` identity belongs to at most one QRK user until disconnected.
3. Start reserves a cryptographically random code as `issuing` and records an internal System activation command. Only backend activation makes it `pending` and visible to the user. The ten-minute expiry is derived during start; replacement supersedes unfinished attempts.
4. The API verifies Meta's raw-body signature, filters original messages for QRK's fixed professional receiver, and submits the System-only receive command. That command consumes an unexpired pending code and records a server-side profile lookup. Its continuation rechecks the accepted sender/message binding before creating or refreshing a proof.
5. Username is a snapshot of control at verification time. Identity uniqueness uses Meta's scoped sender ID with the receiving account ID. Provider failures preserve existing proofs; disconnect releases the link and invalidates matching resolving work.
6. App has a separate managed verification Service session and SharedWorker. Sign-out clears both Service and User identities before Clerk sign-out, including when a session is loading or failed. The upstream fix was first adopted in Zerospin 42.0.4 and is now retained on the current development line through exact 43.0.2 adoption.

## Verification evidence and limits

1. The actual-System backend harness covers the authored success and rejection behavior through Actor/System commands and recorded provider work. The installed harness supports Actor `push`; it does not prove credential authentication, Durable Object delivery, or browser synchronization. The older System-only harness guidance has been corrected.
2. All 24 backend tests, seven focused mocked webhook tests, App/API typechecks, and affected builds pass. Activation coverage includes early DMs, superseded activation, and expiry before activation. No Library tests or live-provider automated tests are used.
3. Meta's documented messaging/profile flow supports the proposed design, but ordinary personal-account delivery still requires the live no-role acceptance test. Simulated payloads and developer/tester access cannot satisfy it. Consult [Meta's maintained Instagram collection](https://github.com/fbsamples/messenger-platform-samples/blob/main/postman/instagram-platform-api.postman_collection.json) and the actual app configuration when determining access requirements.

## Remaining work

1. Investigate app ownership using the pending browser network diagnostics, then establish QRK business ownership of `QRK verification` (`1165998892424227`) in `QRK.SH` (`2223814708480656`). The professional receiver `@qrk.sh` already has Full access / Everything. Two approved Instagram-owner connection attempts returned Meta's unexpected-technical-issue error. The live app's Unified Setup → Business portfolio → Enter business ID flow supports an app administrator sending a request to the business's Requests Inbox without having full portfolio control. After entering the QRK.SH ID, Connect remains disabled and no request was issued. HTML input validity does not establish server eligibility. Repeated console `TypeError: Failed to fetch` errors are uncorrelated; their causal request and the root cause remain unidentified. The diagnostic call was interrupted before dispatch, and resumption awaits the maintainer. See the [ownership investigation](../research/instagram-business-app-ownership.md). Adding a Facebook portfolio administrator was an unproven workaround, not an established requirement. The maintainer has set both pending invitations aside without cancellation. The prior acceptance returned “Something went wrong. The user cannot be added to the business.” The alternate has not been attempted. Keep the personal profile's permitted role limited to administration of QRK-owned assets. App ownership and receiver authorization remain the actual setup gates.
2. Current Unified Login documentation confirms SUAT, `graph.facebook.com`, and `instagram_basic` / `instagram_manage_messages`; the provider host and operator documentation are updated. The webhook also ignores documented `is_self` test events. Automated affected checks pass, but real SUAT sender-profile lookup and Unified message delivery remain unverified. Provision the receiver/token and remaining private environment values after portfolio setup. The receiving Instagram ID remains unset and is distinct from the Meta app ID.
3. Verify authentication isolation, reload persistence, preparation/pending feedback, disconnect, and account transfer through the existing local origins and `__dev` flow. Complete the live DM round trip from an ordinary personal Instagram account with no Meta role.
4. Use the authorized route-restricted tunnel only for Meta callbacks and stop it after verification. Preserve existing storage and unrelated WIP. Open the QRK ready-for-review PR and archive the plan only after required acceptance is complete.

## Pointers

1. [Active plan and current evidence](../plans/054-plan-instagram-verification.md)
2. [App dashboard](<../../apps/app/app/[username]/(dashboard)/page.tsx>)
3. [App setup and session ownership](../../apps/app/README.md)
4. [API webhook setup](../../apps/api/README.md)
5. [Service setup](../../apps/zerospin/README.md)
6. [Service release](../../apps/zerospin/src/services/instagramVerification/instagramVerificationV1.ts)
7. [Current-line upstream sign-out fix PR](https://github.com/morgs32/zerospin/pull/130) (original [42.0.4 fix](https://github.com/morgs32/zerospin/pull/127))
