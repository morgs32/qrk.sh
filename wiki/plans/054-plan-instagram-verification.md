# 054 — Instagram account verification

**Status:** Implementation in progress. Approved on 2026-11-05; required live personal-account verification remains outstanding.

## Summary

1. Add account-level Instagram verification to the existing dashboard, below the account/Create site row and above the sites list.
2. A QRK account may verify multiple Instagram accounts. Each Instagram account may belong to only one QRK account. Users may disconnect an account, releasing that link.
3. Verify control through a code sent by DM to QRK's receiving professional Instagram account. Store challenges and proofs in a shared `instagramVerification` Service.
4. Completion requires a live round trip from a personal Instagram account with no Meta developer/tester role. Use a temporary public callback tunnel; keep browser verification on the existing local origins.
5. Instagram Bricks, scraping, QRK login, and production deployment remain outside this work. Preserve unrelated WIP, existing storage, registered releases, and canonical selections.

## Models and conventions

1. Define `instagramVerificationChallengeV1` with authored attributes `clerkUserId` (indexed text), `receivingAccountId` (text), `code` (unique text), `expiresAt` (date), and `state` (JSON with an Effect-schema-backed union).
2. The challenge state variants are `pending`, `resolving { messageId, senderScopedId }`, `succeeded { messageId }`, `failed { messageId, error: { code, message, retryable } }`, and `superseded`. Required variant data must not become unrelated nullable columns.

   ```ts
   // 1. A resolving challenge always carries its accepted message and sender.
   Schema.Struct({
     status: Schema.Literal("resolving"),
     messageId: Schema.NonEmptyString,
     senderScopedId: Schema.NonEmptyString,
   })
   ```

3. Define `verifiedInstagramAccountV1` with required `clerkUserId`, `receivingAccountId`, `senderScopedId`, `username`, `verifiedAt`, and `messageId`. All identifiers/usernames are text; `verifiedAt` is a date. Index `clerkUserId` without uniqueness.

   ```ts
   // 2. Instagram identity, rather than its changeable username, owns the link.
   indexes: [{
     name: "receiving_account_sender",
     columns: ["receivingAccountId", "senderScopedId"],
     unique: true,
   }]
   ```

4. Zerospin supplies `id`, `modelName`, `version`, `createdAt`, and `updatedAt`; omit them from authored attributes. Keep external Clerk/Meta identifiers as text, use `modelId` for QRK model IDs, and declare primitive descriptors inline.
5. Retain challenge rows and their unique codes to prevent reuse. Keep at most one unfinished challenge per QRK account: starting another supersedes its predecessor.
6. Use one fixed receiving account in this version. Verification records control at challenge time; usernames refresh only through successful reverification.

## Contracts and execution

1. `startInstagramVerificationV1` is an authenticated Actor command with payload `{ id, code }`. Generate a fresh model ID and cryptographically random code in the browser. Derive `clerkUserId` from verified claims, the receiver from shared public configuration, and expiry from the server Effect clock. The canonical service Actor guard checks global ID/code conflicts; the ordinary program supersedes and creates only that user's challenges.
2. `receiveInstagramVerificationMessageV1` is System-only. Accept the trusted receiver, sender, message ID, exact code, and preallocated proof model ID from the webhook adapter. Require a pending challenge for the configured receiver that has not expired. Atomically change it to `resolving` and record one external lookup. Unknown, expired, superseded, and consumed challenges produce no lookup.
3. `resolveInstagramVerificationSenderV1` is an external contract and continuation. Freeze the challenge, owner, receiver, sender, message, and candidate proof IDs in its payload. Fetch the sender's username server-side. Recheck the current resolving challenge and its complete identity binding before writing. Atomically create an unclaimed proof, refresh the same owner's proof, or record `instagram-account-already-linked` for another owner's proof. Provider failures become structured challenge failures. Expected failures must update the row and return successfully rather than throw and roll back the feedback. Concurrent completions have one winner; superseded continuations do nothing.
4. `disconnectInstagramAccountV1` is an authenticated Actor command with payload `{ id }`. Check ownership, delete the proof, and supersede matching resolving challenges so their continuations cannot recreate it. Release uniqueness in the same command, without a provider call.
5. Expiry governs DM acceptance; accepted lookups may finish afterward. Retry failed attempts through a fresh challenge. Preserve existing proofs when another attempt fails.

## Integration and setup

1. Create QRK's professional receiving Instagram account and Meta app. The requested receiving username is `qrk.sh`; availability and successful creation must be verified. The maintainer supplies credentials and handles signup's terms acceptance. Configure its token, Meta app secret, webhook verify token, messaging permissions, and `messages` subscription. Determine access requirements from the actual app configuration. Ordinary personal-account support remains a live acceptance gate. Consult [Meta's maintained Instagram collection](https://github.com/fbsamples/messenger-platform-samples/blob/main/postman/instagram-platform-api.postman_collection.json).
2. Add `/webhooks/instagram` to the API Worker. Implement GET subscription verification and POST HMAC-SHA256 verification over the raw body before decoding. Accept original inbound text messages for the configured receiver; ignore unsupported, self, echo, edited, and deleted events. Dispatch through server-only `getSystemApi(...).executeServiceCommand(...)`. Acknowledge after the receive command finishes, without waiting for profile resolution; return a retryable HTTP failure when delivery cannot be confirmed.
3. Add a Clerk-authenticated Service Actor exposing only its subject's challenges and proofs. Browser grants contain start and disconnect only. Give it a separate managed Service session and SharedWorker definition while retaining existing aggregate-session ownership. Gate only the verification card. Clear both remembered authenticated identities before Clerk sign-out; do not add consumer machinery to conceal an SDK ownership gap.
4. Display all verified accounts with Disconnect. Show the copyable code, receiving account, pending/resolving/expired/error feedback, and explicit missing-configuration feedback. The proof list is authoritative. Keep private credentials outside browser imports.
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

## Implementation evidence — 2026-11-05

1. Implemented the new Service, command-driven models, Actor policy, recorded profile lookup, API webhook, dedicated browser Service session, and dashboard controls in an isolated branch. The existing `user@9` canonical selection and registrations are unchanged.
2. Backend Nx verification passed all six suites and 23 tests, including three Instagram scenarios covering uniqueness, multiple accounts, refresh, duplicate delivery, expiry, replacement, provider failure, disconnect/transfer, and stale completion.
3. Seven focused webhook HTTP tests and the API TypeScript check passed. API's configured Nx dry-run build passed; Wrangler could not write its default external log file under the sandbox, but completed the bundle successfully. This was not a deployment.
4. App TypeScript verification passed before sign-out integration. Its final build and runtime checks remain required after the SDK fix and package adoption.
5. The maintainer explicitly approved fixing the existing Zerospin clear-authentication hook upstream, publishing a new local release, and updating QRK's exact pins. This is needed to revoke remembered Service identity even when startup fails or the managed session becomes inactive. The source fix is isolated from unrelated connected-Node storage WIP.
6. Instagram signup was prepared for the requested receiver; creation, professional-account setup, and Meta configuration are not yet verified. ngrok's existing configuration validates; no tunnel has been started.

## Remaining work

1. Finish and verify the upstream authentication-clear fix, publish its new local fixed-group release, adopt exact pins, and wire both sign-out scopes.
2. Complete receiving-account signup, professional-account/Meta app setup, and private environment configuration. Browser credential/terms steps require the maintainer.
3. Run the final affected builds, configured-origin browser verification, and the required live no-role personal-account round trip. Shut down the temporary tunnel afterward.
4. Reconcile documentation and glossary with actual implemented behavior, open ready-for-review PRs, and archive only when every required verification gate is complete.
