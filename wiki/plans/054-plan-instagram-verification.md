# 054 — Instagram account verification

**Status:** Implementation checks pass on Zerospin 43.0.2. Business Suite sign-in and QRK.SH portfolio access are verified. Meta rejected the approved administrator invitation acceptance; the Facebook administrator has not joined. App ownership, provider setup, local-browser verification, and live personal-account verification remain outstanding. Approved on 2026-11-05.

## Summary

1. Add account-level Instagram verification to the existing dashboard, below the account/Create site row and above the sites list.
2. A QRK account may verify multiple Instagram accounts. Each Instagram account may belong to only one QRK account. Users may disconnect an account, releasing that link.
3. Verify control through a code sent by DM to QRK's receiving professional Instagram account. Store challenges and proofs in a shared `instagramVerification` Service.
4. Completion requires a live round trip from a personal Instagram account with no Meta developer/tester role. Use a temporary public callback tunnel; keep browser verification on the existing local origins.
5. Instagram Bricks, scraping, QRK login, and production deployment remain outside this work. Preserve unrelated WIP, existing storage, registered releases, and canonical selections.

## Models and conventions

1. Define `instagramVerificationChallengeV1` with authored attributes `clerkUserId` (indexed text), `receivingAccountId` (text), `code` (unique text), `expiresAt` (date), and `state` (JSON with an Effect-schema-backed union).
2. The challenge state variants are `issuing`, `pending`, `resolving { messageId, senderScopedId }`, `succeeded { messageId }`, `failed { messageId, error: { code, message, retryable } }`, and `superseded`. Required variant data must not become unrelated nullable columns. Start reserves an `issuing` challenge; only backend activation makes its code usable and visible.

   ```ts
   // 1. A resolving challenge always carries its accepted message and sender.
   Schema.Struct({
     status: Schema.Literal("resolving"),
     messageId: Schema.NonEmptyString,
     senderScopedId: Schema.NonEmptyString,
   });
   ```

3. Define `verifiedInstagramAccountV1` with required `clerkUserId`, `receivingAccountId`, `senderScopedId`, `username`, `verifiedAt`, and `messageId`. All identifiers/usernames are text; `verifiedAt` is a date. Index `clerkUserId` without uniqueness.

   ```ts
   // 2. Instagram identity, rather than its changeable username, owns the link.
   indexes: [
     {
       name: "receiving_account_sender",
       columns: ["receivingAccountId", "senderScopedId"],
       unique: true,
     },
   ];
   ```

4. Zerospin supplies `id`, `modelName`, `version`, `createdAt`, and `updatedAt`; omit them from authored attributes. Keep external Clerk/Meta identifiers as text, use `modelId` for QRK model IDs, and declare primitive descriptors inline.
5. Retain challenge rows and their unique codes to prevent reuse. Keep at most one unfinished challenge per QRK account: starting another supersedes its predecessor.
6. Use one fixed receiving account in this version. Verification records control at challenge time; usernames refresh only through successful reverification.

## Contracts and execution

1. `startInstagramVerificationV1` is an authenticated Actor command with payload `{ id, code }`. Generate a fresh model ID and cryptographically random code in the browser. Derive `clerkUserId` from verified claims, the receiver from shared public configuration, and expiry from the server Effect clock. The canonical service Actor guard checks global ID/code conflicts; the ordinary program supersedes only that user's unfinished challenges, creates an `issuing` challenge, and records its activation command.
2. `activateInstagramVerificationChallengeV1` is an internal System-only command with frozen payload `{ challengeId, clerkUserId, receivingAccountId }`. Recheck the issuing challenge's owner, configured receiver, and expiry before changing it to `pending`. Stale, superseded, or expired activation attempts do nothing. The browser cannot invoke activation and shows preparation feedback until the pending state arrives. This prevents locally optimistic codes from being displayed before the backend can accept their DMs.
3. `receiveInstagramVerificationMessageV1` is System-only. Accept the trusted receiver, sender, message ID, exact code, and preallocated proof model ID from the webhook adapter. Require a pending challenge for the configured receiver that has not expired. Atomically change it to `resolving` and record one external lookup. Unknown, issuing, expired, superseded, and consumed challenges produce no lookup.
4. `resolveInstagramVerificationSenderV1` is an external contract and continuation. Freeze the challenge, owner, receiver, sender, message, and candidate proof IDs in its payload. Fetch the sender's username server-side. Recheck the current resolving challenge and its complete identity binding before writing. Atomically create an unclaimed proof, refresh the same owner's proof, or record `instagram-account-already-linked` for another owner's proof. Provider failures become structured challenge failures. Expected failures must update the row and return successfully rather than throw and roll back the feedback. Concurrent completions have one winner; superseded continuations do nothing.
5. `disconnectInstagramAccountV1` is an authenticated Actor command with payload `{ id }`. Check ownership, delete the proof, and supersede matching resolving challenges so their continuations cannot recreate it. Release uniqueness in the same command, without a provider call.
6. Expiry governs DM acceptance; accepted lookups may finish afterward. Retry failed attempts through a fresh challenge. Preserve existing proofs when another attempt fails.

## Integration and setup

1. Create QRK's professional receiving Instagram account and Meta app. The requested receiving username is `qrk.sh`; availability and successful creation must be verified. The maintainer supplies credentials and handles signup's terms acceptance. Configure its token, Meta app secret, webhook verify token, messaging permissions, and `messages` subscription. Determine access requirements from the actual app configuration. Ordinary personal-account support remains a live acceptance gate. Consult [Meta's maintained Instagram collection](https://github.com/fbsamples/messenger-platform-samples/blob/main/postman/instagram-platform-api.postman_collection.json).
2. Add `/webhooks/instagram` to the API Worker. Implement GET subscription verification and POST HMAC-SHA256 verification over the raw body before decoding. Accept original inbound text messages for the configured receiver; ignore unsupported, self, echo, edited, and deleted events. Dispatch through server-only `getSystemApi(...).executeServiceCommand(...)`. Acknowledge after the receive command finishes, without waiting for profile resolution; return a retryable HTTP failure when delivery cannot be confirmed.
3. Add a Clerk-authenticated Service Actor exposing only its subject's challenges and proofs. Browser grants contain start and disconnect only. Give it a separate managed Service session and SharedWorker definition while retaining existing aggregate-session ownership. Gate only the verification card. Clear both remembered authenticated identities before Clerk sign-out; do not add consumer machinery to conceal an SDK ownership gap.
4. Display all verified accounts with Disconnect. Show preparation feedback while issuing, then the copyable code and receiving account while pending, plus resolving/expired/error and explicit missing-configuration feedback. The proof list is authoritative. Keep private credentials outside browser imports.
5. Register the new Service release while preserving existing declarations and canonical choices. Use a route-restricted ngrok tunnel to the existing local API for callbacks; keep the browser on `app.qrk.localhost`. Stop the tunnel after verification. No production deployment or storage reset.

## Planned hierarchy

Legend: `+` create; `~` modify. Each concrete declaration has its own camelCase file.

```text
qrk.sh/
├── + wiki/plans/054-plan-instagram-verification.md
├── ~ wiki/handoffs/2026-10-13-handoff-instagram-username-verification.md
└── apps/
    ├── zerospin/
    │   ├── + src/services/instagramVerification/
    │   │       models, contracts, Actor, policy, provider, release
    │   ├── ~ src/system.ts and zerospin.config.ts
    │   └── + test/instagramVerification.spec.ts
    ├── api/
    │   ├── + instagramVerification/
    │   │       webhook handler, delivery, focused HTTP tests
    │   └── ~ Worker.ts and environment configuration/declarations
    └── app/
        ├── + zerospin/instagramVerification session definition and worker
        ├── ~ authenticated layout and sign-out ownership
        └── ~ dashboard: verification card and readiness
```

## Verification and completion

1. Use the actual System and registered releases with `makeSystemHarness`. Create rows through Actor/System commands, substitute provider Effects through Layers, and call `flush()`. Cover success, multiple accounts per QRK user, cross-user uniqueness, duplicate delivery, expiry, replacement, provider failure, same-owner reverification, disconnect ownership, and stale completion after disconnect. The installed harness supports Actor commands through `push`; it does not prove credential authentication or distributed delivery.
2. Exercise the HTTP handler with mocked dispatch for handshake, raw-body signatures, receiver filtering, event decoding, duplicates, and failed delivery. Do not call live providers in tests or write/run Library tests.
3. Run the backend Nx test target and affected App/API builds. Verify local authentication isolation, reload persistence, pending feedback, and disconnect through documented `__dev` sign-in.
4. Complete a live DM test from an ordinary personal account with no Meta app role through the temporary tunnel. Verify the intended QRK user's username/proof survives reload, another QRK user cannot claim it while linked, and can claim it after disconnection. Simulated events and tester-role access do not complete this gate.
5. Defaults: 128 random bits encoded as 32 hexadecimal characters; code lifetime 10 minutes; exact code after trimming surrounding message whitespace. No automatic proof expiration, username polling, or transfer.
6. Update affected documentation and existing glossary after implementation, reconcile the old handoff, and correct the stale System-only harness note. Create an ADR only for an implemented decision meeting all three repository criteria. Open a ready-for-review PR. Archive only after required verification is complete.

## Implementation and setup evidence — 2026-11-05 to 2026-11-06

1. Implemented the new Service, command-driven models, Actor policy, recorded profile lookup, API webhook, dedicated browser Service session, and dashboard controls in an isolated branch. The existing `user@9` canonical selection and registrations are unchanged.
2. Backend Nx verification passed all six suites and 23 tests, including three Instagram scenarios covering uniqueness, multiple accounts, refresh, duplicate delivery, expiry, replacement, provider failure, disconnect/transfer, and stale completion.
3. Seven focused webhook HTTP tests and the API TypeScript check passed. API's configured Nx dry-run build passed; Wrangler could not write its default external log file under the sandbox, but completed the bundle successfully. This was not a deployment.
4. App/API TypeScript checks and builds passed after sign-out integration and package adoption. Configured-origin browser and live Meta checks remain required.
5. The maintainer explicitly approved fixing the existing Zerospin clear-authentication hook upstream, publishing a new local release, and updating QRK's exact pins. This is needed to revoke remembered Service identity even when startup fails or the managed session becomes inactive. The source fix is isolated from unrelated connected-Node storage WIP.
6. The maintainer completed signup and approved the final public-profile conversion. Instagram confirms `@qrk.sh` is a Business account. Product/service was selected with category display off; no public contact details were added. ngrok's existing configuration validates; no tunnel has been started.
7. The upstream fix is committed as `117482cbe5` and is ready for review in [Zerospin PR 127](https://github.com/morgs32/zerospin/pull/127). Its 11 focused tests, test typecheck, Browser/React type targets, and Browser lint passed; React lint retains two existing warnings in untouched `ShapeForm.tsx`. All 19 buildable fixed-group packages built, and all 20 packages actually published as `42.0.4` to the persistent local registry without skips. QRK's existing framework pins now all use exact `42.0.4`; the final frozen-lockfile install succeeded using that registry.
8. After adoption, the backend Nx test target again passed all six suites and 23 tests, the seven HTTP tests passed, App/API TypeScript checks passed, and both the App production build and API dry-run build passed. Installed Intent guidance and the managed strict registry rule were refreshed/checked. No local-browser or live Meta acceptance is implied by these checks.
9. The maintainer approved and implementation now includes backend activation: start reserves `issuing`, records the internal System command, and only activation publishes `pending`. The card hides issuing codes and shows preparation or expiry feedback. The backend Nx target passed six suites / 24 tests, including early-DM rejection, superseded activation, and delayed activation expiry. App/API typechecks, API dry-run build, and the App production build passed after this change. The first App build attempt hit the sandbox's temporary-server bind restriction; rerunning with the required permission passed. No additional SDK change was needed.
10. The maintainer approved Meta's terms and completed Facebook password re-authentication. `QRK verification` is created as Meta app `1165998892424227`, with the Instagram messaging/content use case and no business portfolio. The receiving Instagram ID and provider token are not configured; the Meta app ID is a separate identifier.
11. Authenticated current Meta documentation confirms Unified Login requires a business portfolio, a Business Integration System User access token (SUAT), `graph.facebook.com`, and the `instagram_basic` / `instagram_manage_messages` permissions. Its dashboard supports generating a test token for QRK's own professional receiver; no QRK login integration is needed. The provider host now matches this setup. The Graph Messaging reference documents the IGSID `username` lookup, while the actual SUAT lookup and Unified webhook delivery remain live acceptance gates. See [authentication](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication), [setup](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started), and [profile reference](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/user-profile).
12. Prepared ignored feature-worktree links to the original backend `.wrangler/zerospin` and API `.wrangler/state`, preserving durable storage. Installed Portless source confirms explicit positional names preserve the configured origins. No services have been stopped/restarted or data reset.
13. The maintainer approved creating QRK's own business portfolio and connecting the app. Meta rejected creation under the current account's eligibility restriction. No QRK portfolio was created or unrelated-project portfolio selected. Business Support Home is open for the account owner; the choice to investigate official review/support options or handle resolution directly is pending.
14. Current Meta examples document provider self-test events with `message.is_self`; the webhook now decodes and ignores that flag before dispatch. Its existing filtering test covers a flagged event with distinct sender/receiver IDs and a valid code. After the provider and filter changes, all 24 backend tests, seven HTTP tests, API TypeScript verification, API dry-run build, scoped Oxfmt, and diff checks passed. The docs do not explicitly demonstrate a Unified original-message envelope; the live test must establish it. The App has no changes since its passing build/typecheck.
15. The maintainer requested a fresh ownership review using `$yolo`, then confirmed that the personal Facebook profile may be used only as an administrator. QRK must own its business assets; receiver authorization and runtime credentials belong to that business setup. Personal-account restriction repair is no longer the assumed next step. The implementation contains no Facebook human-admin identity: QRK ownership uses Clerk and Instagram identities, while provider credentials remain server-side. Current [Meta migration guidance](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/migration-guide) explicitly says newly created apps cannot set up the older Instagram Login API. Inspect QRK's own professional-account business access and portfolio ownership before further provisioning. No account, credential, storage, or code changes were made during the ownership reassessment.
16. Authenticated [Meta Help](https://www.facebook.com/business/help/1716703571964355) confirms professional-account conversion automatically creates a matching business portfolio. [Business Suite guidance](https://www.facebook.com/business/help/428687951269163) supports Instagram credentials without a Facebook Page and recommends a private browser when a Facebook session interferes. A Chrome Incognito Business Suite session is prepared through its Instagram sign-in; `qrk.sh` is filled and the maintainer's password entry is pending. The actual QRK portfolio ID, full-control access, and Apps settings remain unverified. [App ownership guidance](https://www.facebook.com/business/help/2199735813629697) requires portfolio full control and an app-owner approval when connecting an existing app ID.
17. The maintainer completed Instagram sign-in to Business Suite. Its observed portfolio is `QRK.SH`, business ID `2223814708480656`; People lists `QRKSH (you)` / `@qrk.sh` with Full access / Everything. Apps is empty. The Connect an app ID dialog is prepared with `1165998892424227`; submitting the ownership request awaits action-time confirmation and has not occurred.
18. Integrated current `origin/main` (`9a0a4a957`, including the verified Zerospin 43.0.0 local cutover) into the feature branch without rewriting its published history. The integration preserves every existing registration and canonical selection, plus `instagramVerification@1`. The original checkout now consumes 43.0.1 and owns separate reload verification; do not start this feature's older 42 runtime against the shared state. Interim exact 43.0.1 adoption, frozen installation, App/API typechecks, App production build, API dry-run build, all 24 backend tests, and seven webhook HTTP tests passed. Inspection found 43.0.1 lacks the already-approved clear-authentication hook fix, so this is not the final adoption. Restore that fix on the current upstream line and adopt its new published release before local runtime verification.
19. After the maintainer approved submitting the app ownership request, two attempts returned Meta's unexpected technical issue. Apps remained empty, and Requests → Sent showed no sent requests. No ownership change is confirmed. Following computer unlock and the maintainer's correction of the invitation recipient, the reviewed administrator invitation was sent. Meta confirmed “Invitation sent” with a 30-day expiry, Full access: Everything to QRK.SH, and no individual assets assigned. The maintainer explicitly approved Accept invitation and Meta's Terms of Service and Commercial Terms. The Instagram owner's refreshed People list still showed Invited / No activity. The existing invitation was reopened without resending, continued through the same approved Facebook identity, and its final acceptance was submitted. Meta returned “Something went wrong. The user cannot be added to the business.” The Accept button became available again; no acceptance success was shown. The Facebook administrator has not joined. Meta has not explained either error; no account-restriction cause is established.
20. The approved clear-authentication fix is restored on the current upstream line in commit `caa832eba0`, ready for review in [Zerospin PR 130](https://github.com/morgs32/zerospin/pull/130). All 19 buildable packages built and all 20 fixed-group packages actually published as `43.0.2`; independent registry checks confirmed each version and integrity. QRK now consumes coherent exact `43.0.2` pins through the package manager, with a passing frozen installation. The installed hook uses the managed session binding and retained clear capability outside readiness. Installed Intent guidance was reloaded and the strict registry rule refreshed/checked. Final adoption checks passed all six backend suites / 24 tests, seven webhook HTTP tests, App/API typechecks, the App production build, and API dry-run build. No application source adaptation, development-service restart, storage reset, local-browser acceptance, or live-provider verification occurred during integration.

## Remaining work

1. Resolve Meta's rejection of the approved administrator acceptance: “Something went wrong. The user cannot be added to the business.” Human approval and submission are complete; the Facebook administrator has not joined. The sent invitation grants Full access: Everything to QRK.SH with no individual assets assigned and expires after 30 days. Establish a supported resolution before retrying; Meta has not explained the error, and account-restriction causality is unconfirmed. Then connect app `1165998892424227` to the observed `QRK.SH` portfolio `2223814708480656`, complete any required app-owner approval, and verify ownership. The earlier app connection attempts also failed; app ownership and provider setup remain blocked.
2. Complete receiver/token provisioning with only the required messaging permissions and configure the actual receiver ID, token, Meta app secret, explicit API version, and webhook verify token. Verify sender-profile lookup and the real Unified webhook envelope with that authorization; adapt only if live evidence requires it. No tunnel has been started.
3. Coordinate use of the configured services with the ongoing reload-verification work before starting this feature on the adopted `43.0.2` runtime. Complete configured-origin browser verification and the required live no-role personal-account round trip, including reload persistence, cross-user rejection, disconnect, and transfer. The merge/adoption checks above establish compilation and authored behavior, not a running or accepted SystemSpec. Shut down the temporary tunnel afterward.
4. Record actual setup/runtime evidence, open the QRK ready-for-review PR (the upstream PR is already open), and archive only when every required verification gate is complete. Keep documentation, glossary, and the reconciled handoff current with those results.
