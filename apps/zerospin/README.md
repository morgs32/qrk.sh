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
pnpm nx run @qrk.sh/zerospin:tsc
pnpm nx run @qrk.sh/zerospin:test:workerd
```

For this V1 cutover, start local development with `zerospin dev --clean` from
this directory after building its dependencies. The regular `dev` target does
not reset storage. Existing backend and browser storage must be reset separately;
this cutover provides no compatibility decoder or migration for old rows.

## Source layout

`src/system.ts` registers only user aggregate `1.0.0`. All current models and
contracts start at `1.0.0`; older declaration versions have been removed.

`userActorV1` verifies Clerk through `userProvisionerV1`, then awaits `createUser`
under that provisioner actor and verified identity. Each attempt generates an
independent User resource ID (`usr_…`); `identity.clerkUserId` remains the Clerk
subject. The transactional guard rejects duplicate subjects with
`user-already-exists`, which authentication accepts as successful provisioning.
Other admission or execution failures prevent session initialization.

The web actor filters User → Site → Page → Grid → Brick rows by Clerk identity.
Studio's explicit `userSession` uses the matching V1 web actor and React-owned
initialization/disposal. Models live under `aggregates/user/models/<model>/`,
and contracts under `aggregates/user/contracts/<command>/`.
