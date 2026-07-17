# @zerospin/sync

Cloudflare Agents read-only DO state sync spike. Exercises `useAgent` WebSocket sync and capnweb RPC bumps against a fixture Agent + StateRepo pair.

## Workers for Platforms (remote)

Platform tests run against a **dispatch worker** that forwards to a **user worker** in a dedicated dispatch namespace.

### Dispatch namespace

| Field       | Value                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------- |
| Name        | `zerospin-sync-e2e`                                                                         |
| Dashboard   | Workers & Pages → **Workers for Platforms** → **Dispatch namespaces** → `zerospin-sync-e2e` |
| User script | `sync-fixture`                                                                              |

### Deploy (from `packages/sync/`)

One-time namespace creation:

```bash
pnpm wrangler dispatch-namespace create zerospin-sync-e2e
```

Deploy user worker into the namespace (Agent + StateRepo DOs):

```bash
pnpm wrangler deploy --config wrangler.user.jsonc --dispatch-namespace zerospin-sync-e2e
```

Deploy dispatch worker (public entrypoint):

```bash
pnpm wrangler deploy --config wrangler.dispatch.jsonc
```

Note the dispatch worker URL (e.g. `https://sync-dispatch.<subdomain>.workers.dev`).

### Run platform browser tests

```bash
export ZEROSPIN_SYNC_DISPATCH_URL=https://sync-dispatch.<subdomain>.workers.dev
pnpm nx run @zerospin/sync:test:vitest:browser:platform
```

Requires a prior deploy of both workers to the `zerospin-sync-e2e` namespace.

## Local tests (unchanged)

In-process workerd lane + local `wrangler unstable_dev` browser lane:

```bash
pnpm nx run @zerospin/sync:e2e
```

Vitest config split by runtime: [sync vitest case study](../../llm-wiki/patterns/cases/2026-06-27-sync-vitest-config-by-runtime.md).

## Architecture (platform)

```
Browser (useAgent / RPC)
  → sync-dispatch (dispatch worker)
  → zerospin-sync-e2e namespace.get('sync-fixture')
  → sync-fixture user worker (/rpc, /ws/sync/{name})
  → FixtureStateRepo.bump → FixtureSyncAgent.pushSnapshot → cf_agent_state
```
