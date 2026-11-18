# Zerospin backend

The Zerospin backend serves at <https://zerospin.qrk.localhost/>.

## Development

```sh
pnpm --filter @qrk.sh/zerospin dev
```

### Local V1 reboot

QRK uses Zerospin `48.0.0`. The 44 and 46 storage cutovers reject old catalogs
and chains. The fresh V1 System registers User, Domains, Users and Assets.

For an explicitly authorized local reset, stop the existing QRK System Worker.
First check real paths: from this package `zerospin dev --clean` removes the
whole `.wrangler/zerospin/dev-worker/sys_qrk_sh_1` tree. API Worker R2 persistence
(`../api/.wrangler/state` by default) must be outside it. If a configured
persistence path is inside the reset tree, stop and preserve it first.

From `apps/zerospin`, start the clean System on its existing local origin:

```sh
pnpm exec portless zerospin.qrk --app-port 8788 zerospin dev --clean --port 8788
```

Check that the fresh SystemSpec is accepted before provisioning users or starting
client verification. Subsequent boots use the ordinary `dev` script, without
`--clean`. The System Worker has no creator bucket binding; only the API Worker
reads or writes those bytes. This is not a production migration.

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

The consumer framework packages use the exact `48.0.0` release. The Studio
process is separate from the existing development scripts and does not deploy
or reset application storage.
