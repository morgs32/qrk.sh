---
title: Main-Thread Exact Frontend Authentication
updated: 2026-09-09
---

# Main-Thread Exact Frontend Authentication

Every state fetch, WebSocket-ticket request, and aggregate push starts from the
page's current signature callback. The operation opens a fresh synchronous RPC
session, asks GatewayApi for one exact aggregate or service frontend
capability, performs one call, and disposes the RPC session on both success and
failure.

- [`fetchAggregateFrontendState.ts`](../../../packages/frontend/src/fetchAggregateFrontendState.ts) — authenticates and performs one aggregate state call through a fresh disposable RPC session.
- [`pushAggregateFrontendCommand.ts`](../../../packages/frontend/src/pushAggregateFrontendCommand.ts) — independently authenticates each aggregate push and closes its RPC session.
- [`createServiceFrontendWebSocketTicket.ts`](../../../packages/frontend/src/createServiceFrontendWebSocketTicket.ts) — applies the same one-operation boundary to a service socket ticket.

The aggregate child is bound to `{ systemId, aggregateId, aggregateName,
userId, frontendName, aggregateFrontendLock }`; the service child is bound to
`{ systemId, serviceName, userId, frontendName, serviceFrontendLock }`.
`userId` comes from authentication, `systemId` comes from Worker
configuration, and the remaining target fields are caller-supplied and then
authorized.

- [`getAggregateFrontendApi.ts`](../../../packages/system-worker/src/GatewayApi/getAggregateFrontendApi/getAggregateFrontendApi.ts) — validates, authenticates, authorizes, and constructs the exact aggregate child binding.
- [`getServiceFrontendApi.ts`](../../../packages/system-worker/src/GatewayApi/getServiceFrontendApi/getServiceFrontendApi.ts) — constructs the exact service child through the equivalent boundary.

`aggregateFrontendLock` and `serviceFrontendLock` are schema compatibility descriptions the browser builds from `makeFrontendControllerSpec` at session
bootstrap. Each lock carries the exact model schemas (`{ modelName,
abbreviation, version, propertiesShape, indexes }`) and contract payload
descriptors (`{ commandName, version, payloadShape }`) the client was compiled
against. The worker's `validateAggregateFrontendLock` deep-equals every field
against the models and contracts in the requested aggregate version and rejects mismatches — a changed
model shape or contract payload fails the check regardless of version string.
These shapes carry encoded primitive descriptors; only nested JSON values retain
JSON Schema documents. Date defaults are ISO strings. A
SHA-256 of the canonical JSON is then stored as `aggregateFrontendLockKey` for
subsequent per-request verification without re-running the full comparison.

- [`makeFrontendControllerSpec.ts`](../../../packages/core/src/frontendController/makeFrontendControllerSpec.ts) — builds the lock from the authored frontend controller at session bootstrap.
- [`validateAggregateFrontendLock.ts`](../../../packages/system-worker/src/StaticSystem/validateAggregateFrontendLock/validateAggregateFrontendLock.ts) — deep-equals every model and contract field against the live System, returning the resolved lock and spec on success.
- [`makeAggregateFrontendLockKey.ts`](../../../packages/core/src/frontendController/makeAggregateFrontendLockKey.ts) — derives the SHA-256 key from the canonically sorted lock JSON.

## Trigger

1. A main-thread frontend operation generates a current signature and calls
   `gatewayApi.getAggregateFrontendApi(...)` or
   `gatewayApi.getServiceFrontendApi(...)` through a fresh HTTP-batch RPC
   session.
   - [`fetchAggregateFrontendState.ts`](../../../packages/frontend/src/fetchAggregateFrontendState.ts) — obtains the signature and exact aggregate capability for a state fetch.
   - [`fetchServiceFrontendState.ts`](../../../packages/frontend/src/fetchServiceFrontendState.ts) — obtains the exact service capability independently.

```mermaid
sequenceDiagram
  participant Session as Main-thread frontend session
  participant Gateway as GatewayApi
  participant Auth as Static System authentication
  participant Authorize as Static System authorization
  participant  as VersionedAggregateRepo or VersionedServiceRepo
  participant FrontendApi as Exact frontend child capability
  participant Locator as Browser localStorage

  autonumber 1
  Session->>Gateway: gatewayApi.get*FrontendApi(...)
  autonumber 2
  Gateway->>Gateway: checkPublishableApiKey(...)
  autonumber 3
  Gateway->>Auth: authenticate(...)
  autonumber 4
  Auth-->>Gateway: authenticated userId
  autonumber 5
  Gateway->>Authorize: authorize*Frontend(...)
  autonumber 6
  Authorize->>: repo.authorize*Frontend(...)
  autonumber 7
  -->>Authorize: authorization accepted
  autonumber 8
  Authorize-->>Gateway: selected lock, frontend spec
  autonumber 9
  Gateway-->>Session: bound frontendApi capability
  autonumber 10
  Session->>FrontendApi: frontendApi.getState()
  autonumber 11
  FrontendApi-->>Session: one operation result
  autonumber 12
  Session->>Locator: localStorage.setItem(...)
```

## Annotated workflow steps

1. The main-thread operation supplies the publishable key, authentication lock,
   fresh signature, and exact authored target.
   - [`createAggregateFrontendWebSocketTicket.ts`](../../../packages/frontend/src/createAggregateFrontendWebSocketTicket.ts) — supplies the complete aggregate target for a ticket operation.
   - [`createServiceFrontendWebSocketTicket.ts`](../../../packages/frontend/src/createServiceFrontendWebSocketTicket.ts) — supplies the complete service target.
2. Gateway rejects the request unless its publishable key matches Worker
   configuration.
   - [`getAggregateFrontendApi.ts`](../../../packages/system-worker/src/GatewayApi/getAggregateFrontendApi/getAggregateFrontendApi.ts) — checks the aggregate request before authentication.
   - [`getServiceFrontendApi.ts`](../../../packages/system-worker/src/GatewayApi/getServiceFrontendApi/getServiceFrontendApi.ts) — applies the same service gate.
3. Gateway invokes authored static authentication with the validated lock and
   caller signature. The Worker selects exactly `authenticationLock.version`,
   compares the frontend-authored signature JSON Schema, decodes the signature,
   and invokes that version's callback without adaptation or fallback.
   - [`authenticate.ts`](../../../packages/system-worker/src/authenticate/authenticate.ts) — validates and executes the selected independent authentication version.
   - [`getAggregateFrontendApi.ts`](../../../packages/system-worker/src/GatewayApi/getAggregateFrontendApi/getAggregateFrontendApi.ts) — invokes aggregate authentication.
   - [`getServiceFrontendApi.ts`](../../../packages/system-worker/src/GatewayApi/getServiceFrontendApi/getServiceFrontendApi.ts) — invokes service authentication.
4. Authentication supplies `userId`; Gateway validates that result against the
   authored System identity.
   - [`getAggregateFrontendApi.ts`](../../../packages/system-worker/src/GatewayApi/getAggregateFrontendApi/getAggregateFrontendApi.ts) — validates the returned aggregate authentication identity.
5. Gateway asks static authorization to validate the exact target and frontend
   lock for that user.
   - [`getAggregateFrontendApi.ts`](../../../packages/system-worker/src/GatewayApi/getAggregateFrontendApi/getAggregateFrontendApi.ts) — authorizes the aggregate target and returned fields.
   - [`getServiceFrontendApi.ts`](../../../packages/system-worker/src/GatewayApi/getServiceFrontendApi/getServiceFrontendApi.ts) — performs the equivalent service check.
6. Authorization resolves the matching Repo and invokes its exact
   frontend authorizer.
   - [`authorizeAggregateFrontend.ts`](../../../packages/system-worker/src/authorizeAggregateFrontend/authorizeAggregateFrontend.ts) — reads the chain `baseAggregateVersion` and authorizes against that four-field VersionedAggregateRepo.
   - [`authorizeServiceFrontend.ts`](../../../packages/system-worker/src/authorizeServiceFrontend/authorizeServiceFrontend.ts) — resolves `{ systemId, serviceName }` and invokes the service Repo authorizer.
7. The Repo exposes only the authored target's readable model
   queries to its authorizer.
   - [`authorizeAggregateFrontend.ts`](../../../packages/system-worker/src/VersionedAggregateRepo/authorizeAggregateFrontend/authorizeAggregateFrontend.ts) — constructs the aggregate query surface.
   - [`authorizeServiceFrontend.ts`](../../../packages/system-worker/src/VersionedServiceRepo/authorizeServiceFrontend/authorizeServiceFrontend.ts) — constructs the service query surface.
8. Static authorization returns the selected lock and frontend spec.
   - [`authorizeAggregateFrontend.ts`](../../../packages/system-worker/src/authorizeAggregateFrontend/authorizeAggregateFrontend.ts) — returns the exact aggregate authorization result.
   - [`authorizeServiceFrontend.ts`](../../../packages/system-worker/src/authorizeServiceFrontend/authorizeServiceFrontend.ts) — returns the service result.
9. Gateway binds those accepted fields into the child capability and adds
   configured `systemId`.

- [`getAggregateFrontendApi.ts`](../../../packages/system-worker/src/GatewayApi/getAggregateFrontendApi/getAggregateFrontendApi.ts) — constructs AggregateFrontendApi with its exact six-field binding.
- [`getServiceFrontendApi.ts`](../../../packages/system-worker/src/GatewayApi/getServiceFrontendApi/getServiceFrontendApi.ts) — constructs ServiceFrontendApi with its exact five-field binding.

10. The fresh child performs exactly one state, ticket, or push operation.
    - [`fetchAggregateFrontendState.ts`](../../../packages/frontend/src/fetchAggregateFrontendState.ts) — performs the aggregate state call and disposes its RPC session.
    - [`pushAggregateFrontendCommand.ts`](../../../packages/frontend/src/pushAggregateFrontendCommand.ts) — performs the aggregate push and disposes its RPC session.
11. The child returns that operation's domain result; it is not retained as a
    browser capability owner.
    - [`fetchServiceFrontendState.ts`](../../../packages/frontend/src/fetchServiceFrontendState.ts) — maps the service result and guarantees session disposal.
12. A successful online state fetch writes the exact authentication locator
    key `{ apiUrl, publishableKey, systemName, authenticationLock }` to
    `{ systemId, userId }`. Offline startup may read this locator only to find
    the exact backup namespace.
    - [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — writes or validates the aggregate authentication locator.
    - [`bootstrapServiceFrontendSession.ts`](../../../packages/frontend/src/bootstrapServiceFrontendSession.ts) — applies the same service locator boundary.

## Offline backup lookup

The validated authentication locator supplies only `{ systemId, userId }` for
finding persisted state before a network request. A compatible committed backup
can restore locally while independently authenticated network recovery follows. The aggregate backup route additionally contains caller-selected
`aggregateId`, authored `aggregateName` and `frontendName` (from controller `name`), and the complete
`aggregateFrontendLockKey`. The service route contains authored `serviceName`
and `frontendName` (from controller `name`) plus `serviceFrontendLockKey`. Execution IDs are renewed
within the mounted session and are absent from these backup keys.

- [`makeAggregateFrontendBackupKey.ts`](../../../packages/frontend/src/makeAggregateFrontendBackupKey.ts) — encodes every exact aggregate identity field into a RoutePattern path.
- [`makeServiceFrontendBackupKey.ts`](../../../packages/frontend/src/makeServiceFrontendBackupKey.ts) — encodes the independent service identity path.
- [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — validates the persisted backup identity and requires a valid committed backup when network authentication/state recovery is unavailable.

## Callers

- [Browser session bootstrap](./bootstrapBrowserSession.md)
- [Frontend WebSocket](./FrontendWebSocket.md)
- [IndexedDB backup coordination](./IndexedDbBackupCoordination.md)
- [Architecture overview](../../overview.md)
