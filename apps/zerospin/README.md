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

The consumer framework packages use the exact `36.0.0` release. The Studio
process is separate from the existing development scripts and does not deploy
or reset application storage.
