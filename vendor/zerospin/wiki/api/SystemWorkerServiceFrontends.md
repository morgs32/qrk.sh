---
title: SystemWorker Service Frontend Bindings
type: api
updated: 2026-08-11
---

# SystemWorker Service Frontend Bindings

Service frontend authentication is universal and happens before this boundary.
`SystemWorker.authorizeServiceFrontend` receives exactly `{ generationId,
userId, serviceName, frontendName, serviceFrontendLock }`: `AuthenticatedApi` supplies
the authenticated `userId` and acquired generation locator, while its caller
supplies the source-selected controller names and complete lock. It resolves the
generation-keyed `ServiceRepo`, which invokes the service-owned authorizer with
a synchronous model-only `{ db: { query } }` view
([`SystemWorker.ts:106-119`](../../packages/system-worker/src/SystemWorker.ts#L106-L119),
[`getServiceFrontendApi.ts:64-84`](../../packages/system-worker/src/AuthenticatedApi/getServiceFrontendApi/getServiceFrontendApi.ts#L64-L84),
[`authorizeServiceFrontend.ts:15-72`](../../packages/system-worker/src/authorizeServiceFrontend/authorizeServiceFrontend.ts#L15-L72),
[`ServiceRepo/authorizeServiceFrontend.ts:23-61`](../../packages/system-worker/src/ServiceRepo/authorizeServiceFrontend/authorizeServiceFrontend.ts#L23-L61)).

## Projection owner

`ServiceFrontendRepo` owns the canonical user/frontend-scoped projection and
its outbox under server-private
`{ generationId, serviceName, userId, frontendName }`
([`ServiceFrontendRepo.ts:97-165`](../../packages/system-worker/src/ServiceFrontendRepo/ServiceFrontendRepo.ts#L97-L165),
[`ServiceFrontendRepo.ts:181-240`](../../packages/system-worker/src/ServiceFrontendRepo/ServiceFrontendRepo.ts#L181-L240)).

Before projection, the owner decodes each persisted hybrid service row with
`makeEffectSchema(serviceModel.propertiesShape)`, validates the decoded value
with the authored `resourceSchema`, applies the projection adapter, and
validates the frontend result
([`projectServiceFrontendResource.ts:43-88`](../../packages/system-worker/src/ServiceFrontendRepo/projectServiceFrontendResource/projectServiceFrontendResource.ts#L43-L88),
[`authoredPersistedResourceDecoding.node.spec.ts:46-81`](../../packages/system-worker/src/authoredPersistedResourceDecoding.node.spec.ts#L46-L81)).

## Archive owner

`ServiceFrontendBlockRepo` owns immutable blocks, retained model-version
materializations, replay coverage, and the hibernating WebSocket room. Socket
admission binds exact `{ serviceName, userId, frontendName }` and the complete
service lock
([`ServiceFrontendBlockRepo.ts:52-118`](../../packages/system-worker/src/ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.ts#L52-L118),
[`onConnect.ts:5-55`](../../packages/system-worker/src/ServiceFrontendBlockRepo/onConnect/onConnect.ts#L5-L55)).

## State and ticket authority

The service capability retains one generation-specific read route, revalidates
the complete service lock, reads canonical projection state, omits unselected
models, and adapts visible resources to the selected definitions
([`getServiceFrontendState.ts:23-89`](../../packages/system-worker/src/getServiceFrontendState/getServiceFrontendState.ts#L23-L89),
[`getServiceFrontendState.ts:107-141`](../../packages/system-worker/src/getServiceFrontendState/getServiceFrontendState.ts#L107-L141)).

Ticket creation binds `generationId`, the resolved archive, exact target, and
lock into a single-use route with no deploy or Worker-version identity. The
public `ServiceFrontendApi` exposes the flat receiver-relative `getAdmission()`
receipt plus `getState()` and `createWebSocketTicket()`
([`createServiceFrontendWebSocketTicket.ts:18-95`](../../packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts#L18-L95),
[`ServiceFrontendApi.ts:56-100`](../../packages/system-worker/src/ServiceFrontendApi/ServiceFrontendApi.ts#L56-L100)).

## Related pages

- [[../architecture/Authentication|Universal Authentication]]
- [[../architecture/ServiceFrontendApi]]
- [[../architecture/ServiceFrontendProjection]]
