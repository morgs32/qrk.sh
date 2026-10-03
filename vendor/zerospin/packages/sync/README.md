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

## Architecture (platform)

```
Browser (useAgent / RPC)
  → sync-dispatch (dispatch worker)
  → zerospin-sync-e2e namespace.get('sync-fixture')
  → sync-fixture user worker (/rpc, /ws/sync/{name})
  → FixtureStateRepo.bump → FixtureSyncAgent.pushSnapshot → cf_agent_state
```
