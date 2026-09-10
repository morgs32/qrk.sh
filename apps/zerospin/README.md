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
QRK's scraper keeps its separate Worker configuration in `packages/scraper`.
