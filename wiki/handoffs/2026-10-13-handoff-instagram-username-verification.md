# Handoff: Instagram username verification in Studio

**Date:** 2026-10-13  
**Focus:** Enable account-level Instagram username ownership verification through a DM challenge.  
**Status:** Research and source inspection complete; feature implementation and Meta configuration have not started. Backend design remains unsettled.

## Goal

Add an **Instagram verification card to Studio's existing dashboard**, below the account/Create site row and above the sites list. The user explicitly selected this placement.

Verify control of an Instagram username. QRK login, public Instagram scraping, and brick configuration remain outside this feature. Verification records control at the time of the challenge; it does not establish permanent ownership of a username.

## Done

1. Researched Meta's current APIs. Instagram OAuth supports professional accounts only, even for username access. [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)
2. Identified a proposed alternative: users DM a verification code to QRK's professional Instagram account. Meta supplies the sender ID, and its profile API returns the username after messaging consent. The documentation supports personal-account correspondents by implication; validate that live before promising support. This combined verification flow is a QRK proposal, not a built-in Meta verification feature. [Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/), [User Profile API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile/)
3. Inspected Studio and backend ownership. No verification routes, challenge storage, provider identity fields, or trusted completion path currently exist. The existing API response-retention store contains scraped payloads, not ownership proofs. Studio's route username is separate from the Instagram username being verified.
4. No implementation or Meta configuration was performed. Existing Library forms and Studio session/editor changes are unrelated WIP to preserve.

## Remaining

1. Confirm QRK's receiving professional Instagram account, Meta app, messaging permissions, and production access requirements. The documented scopes are `instagram_business_basic` and `instagram_business_manage_messages`; receiving messages also requires the appropriate webhook subscription. Do not assume owning the receiving account eliminates production review requirements. [User Profile API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile/), [Platform overview](https://developers.facebook.com/docs/instagram-platform/overview/)
2. Settle authoritative storage for challenges and verified identities, plus the server-only completion boundary. Existing response-retention storage is not verification state. The API currently has no configured delivery path into the Zerospin user aggregate; do not invent a browser command that lets users declare themselves verified.
3. Implement the dashboard flow after the remaining design decisions are settled: start verification, show copyable code and receiving account, show pending/expired/error feedback, then display **Verified @username**.
4. Bind the challenge to the authenticated Clerk subject. Validate Meta webhook signatures, resolve the sender's username server-side, and consume the challenge once. Keep provider credentials server-side.
5. Verify authentication isolation, expiry, replay rejection, duplicate delivery, provider failure, and persistence after reload. Include a live check that a personal account can send the challenge and have its username resolved. Run scoped Studio/backend checks; **never write or run Library tests**.
6. Update affected documentation and preserve existing forms/session WIP. Archive this handoff only after verified completion or reconciliation into successor work, following the handoff lifecycle.

Annotated flow:

```text
Studio creates a challenge -> code belongs to the authenticated QRK user
User DMs the code          -> evidence comes from their Instagram account
Server resolves username   -> use Meta's sender ID, not browser input
Server records proof       -> consume the code and persist verification
Studio shows verified      -> reflect authoritative server state
```

Illustrative proof data; final storage schema is unsettled:

```ts
({
  clerkUserId: "<challenge owner>",       // Authenticated when issued
  instagramScopedId: "<Meta sender ID>",  // Scoped to QRK's receiving account
  instagramUsername: "<Meta username>",   // Retrieved server-side
  verifiedAt: "<server timestamp>",       // Control proven at this moment
})
```

## Suggested skills

1. `$research` - validate Meta production requirements and personal-account messaging.
2. `$grill-me` - resolve remaining ownership and lifecycle decisions. Root guidance still names `$spec`, but that skill was not found in the inspected skill roots; `grill-me` is the current planning workflow referenced by `handoff`.
3. `$use-morgs32-wiki-patterns` - follow repository boundaries and conventions.
4. `$implement` - execute the settled plan and complete verification.
5. `$nx-workspace` / `$nx-run-tasks` - discover and run scoped checks.

## Pointers

1. [AGENTS.md](../../AGENTS.md)
2. [Studio dashboard](../../apps/studio/app/[username]/(dashboard)/page.tsx)
3. [Studio README](../../apps/studio/README.md)
4. [API routing](../../apps/api/Worker.ts)
5. [Current authenticated HTTP boundary](../../apps/api/http.ts)
6. [Existing response-retention store](../../apps/api/BackendRepo.ts)
7. [Current user model](../../apps/zerospin/src/aggregates/user/models/user/UserV1.ts)
8. [Current Instagram brick form](../../apps/library/modules/instagram/InstagramForm.tsx)
9. [Meta messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
10. [Meta sender profile API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile/)

## Open decisions

1. Authoritative backend owner and trusted completion mechanism.
2. Challenge lifetime and replacement behavior.
3. Whether one Instagram account can verify multiple QRK users.
4. Reverification behavior when usernames change.
