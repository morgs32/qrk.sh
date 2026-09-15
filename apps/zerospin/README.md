# QRK Zerospin backend

`zerospin.config.ts` exports the authored system with its existing
`sys_qrk_sh_1` identity. Zerospin generates the backend Wrangler configuration,
Worker entrypoint, and bindings. The derived Worker name is `zerospin-qrk-sh`.

Put local authentication settings in this directory's `.env.local` (see
`.env.example`). The CLI discovers environment files from this project root.
Workerd tests provide isolated test credentials in `vitest.workerd.config.ts`
and generate their configuration without a prior CLI run.

Run the checks from the repository root:

```sh
pnpm nx run @qrk.sh/zerospin:typecheck
pnpm nx run @qrk.sh/zerospin:test:workerd
```

The existing `dev` target includes `--clean` and resets this system's local
backend state. Use the CLI without `--clean` when retaining that state.
QRK's scraper lives in `packages/bricks/src/scraper`; its Worker configuration is
`packages/bricks/wrangler.jsonc`, used by the combined Vite+ workbench.

## Source layout

`src/system.ts` registers the user aggregate.
`authentication.clerkUserId` is the verified Clerk identity; `userId` refers to an independently
generated User resource ID (`usr_…`), including site ownership references.
`UserV6.authentication.authenticate` verifies Clerk and awaits `executeCommand` for `createUser`.
Each attempt generates independent command and user resource IDs. The transactional
guard rejects an existing `clerkUserId` with `user-already-exists`; authentication accepts
only that rejection as successful provisioning and preserves the first user ID.
Other failures prevent authentication from completing. Site creation passes that
stored resource ID, and its guard verifies ownership against the Clerk identity.
`src/aggregates/user/user.ts` declares its identity; `UserV6.ts` defines version 6.
Models live under `aggregates/user/models/<model>/`, and contracts under
`aggregates/user/contracts/<command>/`, with separate identity and version files.
`aggregates/user/userFrontend.ts` exposes the web frontend.
The existing Workerd integration suites remain in `src/`.

Authentication returns `{ aggregateId, clerkUserId }`, deriving the aggregate ID
from the verified Clerk subject. Selections use only `{ clerkUserId }` and partition
replicas by `/:clerkUserId`. The web frontend declares the same schemas; `ZerospinApp.makeFrontend(userFrontend)` binds its component to the app.
`ZerospinUser` mounts beneath `ZerospinApp.Provider`, signs through its
`generateSignature` prop, and receives its aggregate ID from authentication.
The frontend is keyed by Clerk user ID so identity changes remount the session.
Brick records and grid command payloads use `groupId` and `catalogId`. These fixed
schemas require empty affected storage: reset this system's local state with
`pnpm nx run @qrk.sh/zerospin:dev --clean` before reusing a pre-cutover database.
