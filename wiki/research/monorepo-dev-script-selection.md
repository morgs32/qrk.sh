# Selecting monorepo development scripts

Researched 2026-10-18 against first-party documentation and source. QRK installs Portless **0.15.8**; its release tag and upstream `main` both resolve to commit `27598545f08f8055cb3b9fb410f8d250f054f46d` at research time. The implementation findings below are pinned to that commit, rather than assuming newer documentation provides new filtering behavior. [QRK dependency](../../package.json), [Portless release](https://github.com/vercel-labs/portless/releases/tag/v0.15.8), [pinned source](https://github.com/vercel-labs/portless/tree/27598545f08f8055cb3b9fb410f8d250f054f46d).

## Answer

There are two useful patterns: give the selected scripts a distinct name, or keep ordinary `dev` scripts and select packages in the runner. `dev:portless` is QRK's choice, not a required Portless convention. Portless itself documents `dev:app` for the underlying framework command, while pnpm, Turborepo, and Nx support selecting packages/projects separately from their task name. These are supported patterns, not evidence of one universal standard. [Portless example](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/README.md#turborepo), [pnpm filtering](https://pnpm.io/10.x/filtering), [Turborepo development](https://turborepo.dev/docs/crafting-your-repository/developing-applications#running-a-specific-application), [Nx run-many](https://nx.dev/docs/reference/nx-commands#nx-run-many).

## What Portless can select

- Root Portless discovers workspace packages and chooses scripts, defaulting to `dev`. Root `script` or `--script` changes that name; per-package `portless.script` and `apps` entries can override it. Missing selected scripts are skipped. The `apps` map is **overrides, not an allowlist**. [Configuration](https://portless.sh/configuration), [selection implementation](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/src/cli.ts#L3855-L3885).
- No package `include`, `exclude`, `disabled`, or `skip` field exists in the inspected schema, and no package-filter CLI option is documented. `proxy: false` still runs the script; it only suppresses the proxy route. Package metadata can change a script, but does not offer a separate membership flag. [Configuration keys](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/src/config.ts#L314-L409), [commands](https://portless.sh/commands), [proxy decision](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/src/cli.ts#L3875-L3885).
- Workspace glob exclusions are honored, but they remove packages from workspace discovery itself. Changing QRK's package membership just to control startup would conflate two separate decisions. [Workspace discovery and glob implementation](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/src/workspace.ts#L82-L126), [negated globs](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/src/workspace.ts#L191-L225).
- Do not simulate an allowlist with an entirely nonexistent default script plus `script: "dev"` overrides on selected apps. Root dispatch first requires at least one package to have the **default script**, before it evaluates those overrides. This is an implementation caveat, not a documented selection interface. [Root dispatch](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/src/cli.ts#L3556-L3583).

## Conventions in other runners

| Runner | First-party pattern | Implication |
| --- | --- | --- |
| pnpm 10 | Filter packages by name or directory, then run a script. `--parallel` starts matching scripts without topological ordering and is recommended for long-running processes. | Ordinary `dev` can remain available in examples without making them part of the root stack. [Filtering](https://pnpm.io/10.x/filtering), [parallel scripts](https://pnpm.io/10.x/cli/run#--parallel). |
| Turborepo | The development guide uses `turbo dev --filter=web`; development tasks use `persistent: true` and `cache: false`. | App selection belongs in filters, independently of `dev`. Current docs deprecate `--parallel`; persistent tasks and `with` preserve dependency behavior. [Development guide](https://turborepo.dev/docs/crafting-your-repository/developing-applications), [run reference](https://turborepo.dev/docs/reference/run). |
| Nx | `run-many` selects projects through `--projects`/`-p`, including project tags, independently of the target. | A shared `dev` target can be selected by project or tag. `--parallel` sets concurrency; skipping task dependencies is a separate option. [Command reference](https://nx.dev/docs/reference/nx-commands#nx-run-many). |

For example, this command is constructed from pnpm's documented filtering and parallel-run options:

```sh
# Select packages under apps/; examples/ can retain their own dev scripts.
pnpm --filter './apps/*' --parallel run dev
```

That command alone does **not** register Portless routes. Each selected app can wrap its actual framework command directly: **`dev: "portless run next dev ..."`**, with no second script required. This is a documented Portless interface; using pnpm as the parent runner is a derived composition. The optional `dev` → `portless` → `dev:app` arrangement in its Turbo example is useful when a separate direct command is wanted. [Inline package-script integration](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/README.md#use-in-packagejson), [explicit-command implementation](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/src/cli.ts#L4185-L4254), [optional split scripts](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/README.md#turborepo).

```jsonc
// Representative Web package.json excerpt; not an applied change:
{
  "scripts": {
    "dev": "portless run next dev --turbopack --port 3000"
  },
  "portless": { "name": "qrk", "appPort": 3000 }
}
```

The local metadata in that example matters: version 0.15.8's `loadConfig` reads only the current directory, so package-level `portless run` does **not** automatically inherit a root `apps` map. Preserve exact names and ports through package metadata/configuration or command flags; preserve root proxy environment variables and Studio's existing API-origin overrides too. This migration detail follows the inspected implementation, despite the broader root-config wording in the documentation. [Config locality](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/src/config.ts#L25-L57), [name and port resolution](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/packages/portless/src/cli.ts#L4185-L4232), [Studio environment](../../apps/app/package.json).

## Recommendation for QRK

For a native Portless root runner, **`dev:app` is a reasonable neutral replacement for `dev:portless`**: the name describes the script's role, and the suffix already appears in Portless's own examples. Applying that name as the root discovery selector is QRK's convention; upstream's example uses it as an inner framework script. Changing the name does not require adopting another runner. [Root selector](../../portless.json), [upstream naming example](https://github.com/vercel-labs/portless/blob/27598545f08f8055cb3b9fb410f8d250f054f46d/README.md#turborepo).

If avoiding special selector scripts is the stronger priority, **ordinary `dev` scripts wrapping direct Portless commands, selected by filtered pnpm**, is the more explicit selection model. No extra `dev:app` script is required. It changes startup ownership and configuration placement, so it is larger than renaming the current selector. Use one root runner and let each selected app start its own process; avoid reinstating a second startup dependency graph merely for selection. This is a recommendation from the compared interfaces, not an upstream requirement.

QRK's immediate discovery collision is with `examples/*`, which have `dev` scripts. Storybooks already use the separate `storybook` script name. No configuration was changed during this research. [Workspace membership](../../pnpm-workspace.yaml), [example scripts](../../examples/tanstack-router-motion/package.json), [Studio scripts](../../apps/app/package.json), [Web scripts](../../apps/web/package.json), [Library scripts](../../apps/library/package.json).

## Chosen implementation

The approved follow-up uses Portless's documented split: each app has `dev: "portless"`, with its actual server command in `dev:app`. Native root Portless discovery selects `dev:app` in exactly five apps; filtered pnpm remains an alternative, not the selected runner. Each app's package metadata owns its hostname, script, fixed port, and proxy setting so root and individual startup agree. Studio retains its HTTPS API-origin overrides. Nx startup dependencies and bypass flags are removed; an individual app command starts only that app. [Root configuration](../../portless.json), [Studio scripts and metadata](../../apps/app/package.json), [startup instructions](../../README.md#getting-started).
