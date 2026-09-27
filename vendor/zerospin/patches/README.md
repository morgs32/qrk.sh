# Dependency patches

`sql.js@1.14.1.patch` allows the WASM initializer to run in Cloudflare Workers,
where `WorkerGlobalScope` exists but `self.location` does not. The validation
snapshot adapter supplies an already imported WASM module through
`instantiateWasm`; it does not fetch WASM relative to a script URL. The patch
only makes the unused script-location lookup optional.

With pnpm 11.1.1, install patch changes using
`pnpm install --config.optimisticRepeatInstall=false` to bypass its repeat-install
shortcut. The checked-in lockfile records the patch hash.
