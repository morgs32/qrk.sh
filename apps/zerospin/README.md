# Zerospin backend

The Zerospin backend serves at <https://zerospin.qrk.localhost/>.

## Development

```sh
pnpm --filter @qrk.sh/zerospin dev
```

## Portless

```sh
portless get zerospin.qrk
```

## Test

```sh
pnpm --filter @qrk.sh/zerospin test
```

## Declaration Board

Run `pnpm studio` from the repository root, or
`pnpm --filter @qrk.sh/zerospin studio` from any workspace directory. The backend
package launches `zerospin studio` through Portless at
<https://studio.qrk.localhost/>, using port 10030 for the local process.
It loads `apps/zerospin/zerospin.config.ts` and its local environment files to
show the authored Declaration Board. Restart Studio after declaration changes.
Deployment credentials are unnecessary. Repo/table inspection belongs in
Zerospin Cloud under Organization → System → Instance → Studio.

The consumer framework packages use exact versions recorded in `package.json`.
The Studio process is separate from the existing development scripts and does
not deploy or reset application storage.

## Instagram account verification

The shared `instagramVerification` Service owns DM challenges and verified
Instagram identities. Its authenticated Actor exposes only the signed-in Clerk
subject's rows and the start/disconnect commands. The API webhook uses the
System-only receive command; the originating Chain records the sender-profile
lookup and its continuation even when no browser is open. Successful completion
claims `(receivingAccountId, senderScopedId)` atomically. A username is the label
observed at verification time, not the account's identity.

Set `NEXT_PUBLIC_INSTAGRAM_RECEIVING_ACCOUNT_ID` and
`NEXT_PUBLIC_INSTAGRAM_RECEIVING_USERNAME` to the single professional receiver's
actual ID/username in the existing ignored `.env.local`. App needs the same public
values; API needs the same receiver ID. Restart the backend and rebuild/restart
App after changing this fixed configuration. Keep the receiver fixed while these
proofs are in use; receiver rotation is outside this version's identity guarantee.

The backend also needs private `INSTAGRAM_ACCESS_TOKEN` and an explicit
`INSTAGRAM_GRAPH_API_VERSION` supported by the Meta app. The provider Layer is
registered in `zerospin.config.ts`; tests substitute it without contacting Meta.
Missing receiver configuration refuses new challenges explicitly. Missing provider
configuration becomes failed verification feedback, without deleting existing
proofs. Keep credentials outside source control and browser imports.

Codes remain valid for ten minutes until the DM is accepted. The accepted lookup
may finish later. A new challenge supersedes unfinished work, and disconnect
invalidates matching resolving work before deleting the proof. Old codes are
retained to prevent reuse. This feature changes no Instagram Brick state or
scraping behavior.

Implementation and required live acceptance are tracked in
[Plan 054](../../wiki/plans/054-plan-instagram-verification.md). Simulated webhook
tests do not establish personal-account delivery or Meta app access.
