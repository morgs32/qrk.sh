---
title: Frontend Programs
type: api
updated: 2026-08-11
---

# Frontend Programs

`@zerospin/frontend` exposes one universal authentication program plus
aggregate and service capability leaf programs.

## Authentication

`authenticate({ authenticationLock, generateSignature })` generates the
signature, opens the Worker-hosted `GatewayApi`, and calls
`getAuthenticatedApi({ publishableKey, authenticationLock, signature })`. It
reads `getAuthentication()` and returns exactly `{ authenticationLock, systemId,
systemName, systemVersion, userId, authenticatedApi,
releaseAuthenticatedApi }`; the idempotent release disposes the root RPC
session
([`authenticate.ts:16-59`](../../packages/frontend/src/authenticate.ts#L16-L59),
[`authenticate.ts:60-105`](../../packages/frontend/src/authenticate.ts#L60-L105)).

## Capability leaves

Aggregate leaves are receiver-relative `getAdmission()`, `getState()`,
`pushCommands()`, query methods, and `createWebSocketTicket()`. Admission is a
flat replay of exact admitted actor, frontend, lock, spec, and System metadata.
Push sends the complete command array to the
system-id-addressed SystemRepo without a caller lifecycle identity; state,
queries, and tickets retain the acquired generation route. Service leaves
are `getAdmission()`, `getState()`, and `createWebSocketTicket()`
([`AggregateFrontendApi.ts:66-148`](../../packages/system-worker/src/AggregateFrontendApi/AggregateFrontendApi.ts#L66-L148),
[`AggregateFrontendApi/pushCommands.ts:52-61`](../../packages/system-worker/src/AggregateFrontendApi/pushCommands/pushCommands.ts#L52-L61),
[`ServiceFrontendApi.ts:56-100`](../../packages/system-worker/src/ServiceFrontendApi/ServiceFrontendApi.ts#L56-L100)).

## Related pages

- [[../architecture/Authentication|Universal Authentication]]
- [[../architecture/AggregateFrontendApi]]
- [[../architecture/ServiceFrontendApi]]
