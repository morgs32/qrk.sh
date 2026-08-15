---
title: Core System and Frontend Controllers
type: api
updated: 2026-08-11
---

# Core System and Frontend Controllers

The core authoring surface separates universal authentication, owner
authorization, and frontend representation definitions.

## Public surface

| Module                                         | Responsibility                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authentication/makeSignature`                 | Defines the current signature schema, retained historical schemas, and direct historical-to-current adapters. Versions must be stable `major.minor.patch` SemVer ([`makeSignature.ts:4-35`](../../packages/core/src/authentication/makeSignature.ts#L4-L35), [`makeSignature.ts:38-75`](../../packages/core/src/authentication/makeSignature.ts#L38-L75)). |
| `authentication/makeAuthenticationLock`        | Encodes only the selected authentication signature version and JSON Schema ([`makeAuthenticationLock.ts:6-33`](../../packages/core/src/authentication/makeAuthenticationLock.ts#L6-L33)).                                                                                                                                                                  |
| `system/makeSystem`                            | Requires top-level `{ authentication: { signature, authenticate } }`; `authenticate` returns `userId` ([`makeSystem.ts:460-469`](../../packages/core/src/system/makeSystem.ts#L460-L469), [`makeSystem.ts:581-627`](../../packages/core/src/system/makeSystem.ts#L581-L627)).                                                                              |
| `frontendController/makeFrontendController`    | Defines aggregate/service representation, target names, models, contracts, and guards; it carries no authentication schema or callback ([`types.ts:17-66`](../../packages/core/src/frontendController/types.ts#L17-L66)).                                                                                                                                  |
| `frontendController/makeAggregateFrontendLock` | Encodes `{ systemName, frontendName, models, contracts }` for an aggregate frontend ([`makeAggregateFrontendLock.ts:6-33`](../../packages/core/src/frontendController/makeAggregateFrontendLock.ts#L6-L33), [`makeAggregateFrontendLock.ts:93-107`](../../packages/core/src/frontendController/makeAggregateFrontendLock.ts#L93-L107)).                    |
| `frontendController/makeServiceFrontendLock`   | Encodes `{ systemName, frontendName, models }` for a read-only service frontend ([`makeServiceFrontendLock.ts:6-25`](../../packages/core/src/frontendController/makeServiceFrontendLock.ts#L6-L25), [`makeServiceFrontendLock.ts:67-80`](../../packages/core/src/frontendController/makeServiceFrontendLock.ts#L67-L80)).                                  |

## Owner authorization

An aggregate with frontends must define `authorize`. Its generation-keyed
`AggregateRepo` already binds `aggregateName`, and the callback receives exactly
`{ db: { query }, aggregateId, userId, frontendName }`. The parallel
generation-keyed `ServiceRepo` binds `serviceName`, and its callback receives
`{ db: { query }, userId, frontendName }`. Root authentication supplies
`userId`; owner admission supplies the remaining target fields. Each database
exposes only that owner's declared model queries, and owners without frontends
cannot declare the callback
([`makeSystem.ts:499-511`](../../packages/core/src/system/makeSystem.ts#L499-L511),
[`makeSystem.ts:531-549`](../../packages/core/src/system/makeSystem.ts#L531-L549),
[`frontendBinding/types.ts:195-232`](../../packages/core/src/frontendBinding/types.ts#L195-L232),
[`AggregateRepo/authorizeAggregateFrontend.ts:51-73`](../../packages/system-worker/src/AggregateRepo/authorizeAggregateFrontend/authorizeAggregateFrontend.ts#L51-L73),
[`ServiceRepo/authorizeServiceFrontend.ts:40-61`](../../packages/system-worker/src/ServiceRepo/authorizeServiceFrontend/authorizeServiceFrontend.ts#L40-L61)).

Normalized guards retain their concrete declared `models`, and `makeSystem`
requires each declared model to be the identical controller and authoritative
aggregate binding. The public database type rejects undeclared query keys,
writes, raw SQL, transactions, and the underlying client. At runtime both
speculative `AggregateFrontendRepo` preparation and cursor-stale authoritative
`AggregateRepo` revalidation construct a synchronous query record from exactly
those keys and fail if a binding is missing; a payload-only guard therefore
receives an empty query record
([`makeSystem.ts:1539-1553`](../../packages/core/src/system/makeSystem.ts#L1539-L1553),
[`makeFrontendController.typecheck.ts:106-139`](../../packages/core/src/frontendController/makeFrontendController.typecheck.ts#L106-L139),
[`prepareAggregateFrontendCommand.ts:62-84`](../../packages/system-worker/src/AggregateFrontendRepo/prepareAggregateFrontendCommand/prepareAggregateFrontendCommand.ts#L62-L84),
[`runAggregateFrontendGuards.ts:49-68`](../../packages/system-worker/src/AggregateRepo/runAggregateFrontendGuards/runAggregateFrontendGuards.ts#L49-L68),
[`finalizePushedCommands.ts:437-478`](../../packages/system-worker/src/AggregateRepo/finalizePushedCommands/finalizePushedCommands.ts#L437-L478),
[`aggregateFrontendGuardFlow.workerd.spec.ts:51-296`](../../packages/system-worker/src/aggregateFrontendGuardFlow.workerd.spec.ts#L51-L296)).

## Version selection

Authentication version selection is root-wide. Model and contract selections
remain per frontend. A frontend lock is the complete canonical result of the
representation selection and therefore contains no signature/user identity
fields
([`makeZerospinApp.tsx:97-137`](../../packages/react/src/makeZerospinApp.tsx#L97-L137),
[`resolveFrontendSourceSelection.ts:209-347`](../../packages/react/src/resolveFrontendSourceSelection.ts#L209-L347),
[`makeAggregateFrontendLock.ts:6-33`](../../packages/core/src/frontendController/makeAggregateFrontendLock.ts#L6-L33)).

## Related pages

- [[../architecture/Authentication|Universal Authentication]]
- [[../architecture/SourceSelectedFrontends|Source-Selected Frontends]]
