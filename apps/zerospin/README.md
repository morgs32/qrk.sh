# QRK Zerospin backend

`zerospin.config.ts` exports the authored system with its existing
`sys_qrk_sh_1` identity. Zerospin generates the backend Wrangler configuration,
Worker entrypoint, and bindings. The derived Worker name is `zerospin-qrk-sh`.

Put local authentication settings in this directory's `.env.local` (see
`.env.example`). The CLI discovers environment files from this project root.
Workerd tests provide isolated test credentials in `vitest.workerd.config.ts`
and generate their configuration without a prior CLI run.
Session fixtures instantiate a precompiled wa-sqlite module. The test loader uses
that module's own URL instead of its generated browser-only `self.location` lookup.

Run the checks from the repository root:

```sh
pnpm nx run @qrk.sh/zerospin:ts
pnpm nx run @qrk.sh/zerospin:test:workerd
```

QRK installs the CLI and runtime packages at `7.0.0` from the populated local
registry described in the [root README](../../README.md#zerospin-packages). Nx
builds QRK's reusable Library before backend checks and development; it does not
rebuild installed Zerospin files.

The package cutover requires empty storage for superseded retained command and
SQLite schemas. The regular `dev` target does not reset storage. Stop development
before moving `.wrangler/zerospin/dev-worker/sys_qrk_sh_1` into a uniquely named
directory under `.wrangler/zerospin/backups/`. Starting the normal Nx `dev`
target then creates current storage while preserving the old directory for
recovery. Do not use `--clean` when the old data must be preserved.

Browser backups are scoped by origin. Verification can use a fresh loopback
hostname in the existing Chrome profile, preserving its login and all previous
origin databases. Old backend or browser rows have no compatibility decoder or
migration; restoring an old directory does not make those rows readable by the
new packages.

## Source layout

`src/system.ts` registers only user aggregate `1.0.0`. All current models and
contracts start at `1.0.0`; older declaration versions have been removed.

`userActorV1` verifies Clerk through `userProvisionerV1`, then its authorization awaits `createUser`
under that provisioner actor and verified identity. Each attempt generates an
independent User resource ID (`usr_…`); `identity.clerkUserId` remains the Clerk
subject. The provisioner guard runs inside the aggregate command transaction and
rejects duplicate subjects with `user-already-exists`, which authorization
accepts as successful provisioning.
Other admission or execution failures prevent session initialization.

The web actor selects User → Site → Page → Wall → Brick → Placement rows by Clerk
identity and explicitly exposes those six model schemas. The provisioner exposes
only User. Each actor declares its exposed models separately from its canonical
query database and row selections. Wall, Brick, Placement, and their editing contracts are supplied by
`@qrk.sh/library/libraryModule`. QRK owns the Page's `wallId` reference; `createPage`
creates that deterministic wall and the Page in one command. Legacy Grid/Brick
snapshot contracts have been removed. There is no migration or lazy wall provisioning.
Existing Studio browser databases remain untouched by this code cutover.
Studio's `userSessionRelease` uses the matching V1 web actor. Its `UserApp.Initializer`
owns initialization and disposal for each Clerk identity. Models live under `aggregates/user/models/<model>/`,
and contracts under `aggregates/user/contracts/<command>/`.

The private provisioner owner guard owns identity and duplicate-user decisions in
one admission transaction. Its declared aggregate failures retain their domain
codes. Browser editing guards declare contract failures; programs record deferred operations through their named descriptor map and return only their domain result. Checked evaluation produces the ordered batch and result together; reads remain on pre-application state. The web actor does not expose `createUser`.

Browser command occurrences carry nullable private failures. Confirmed occurrences
settle optimism even when their selected resource delta is empty. Canonical
provisioning command results retain server finalization. Node storage schema 14
and native session schema 3 require empty affected storage when upgrading to 7.0.0;
the package update does not reset or translate existing storage.
