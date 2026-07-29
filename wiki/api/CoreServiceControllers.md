---
title: Core Service Controllers
type: api
updated: 2026-07-27
sources:
  - path: packages/core/package.json
    sha: ff68dfce824266c8cdea060f7a2509e9eacca27b
    lines: 8-43
  - path: packages/core/src/serviceFrontendController/makeServiceFrontendController.ts
    sha: f1127d4f98a2b4ed95d7c3dc55732877101991e8
    lines: 12-78
  - path: packages/core/src/serviceFrontendController/makeServiceFrontendControllerSpec.ts
    sha: 470fdce5b8faed5c663af5d69f7777e39da9a6c3
    lines: 8-36
  - path: packages/core/src/serviceActorController/makeServiceActorController.ts
    sha: 768a5c265d2e3dd9869ceeb438da6bcad2d68548
    lines: 20-131
  - path: packages/core/src/service/makeServiceController.ts
    sha: 2d910b6875fe5a2d7560e0cf3c3fca259047ac26
    lines: 58-388
  - path: packages/core/src/system/makeSystem.ts
    sha: da0a9ce26c7efb074b1c61859a94ce063e06407b
    lines: 19-157
  - path: packages/core/src/system/makeSystemSpec.ts
    sha: 3268ae3bcc3ea4002784efe7b7cb11d3c400fe9e
    lines: 263-453
  - path: packages/core/src/serviceActorController/types.ts
    sha: aa546726eb8f9a49540c7f52140a666f99f03ebc
    lines: 8-20
  - path: packages/system-worker/src/ServiceRepo/authenticateServiceFrontend/authenticateServiceFrontend.ts
    sha: 564c16c99c5f5a0d023a81e4b856ab1798e7708a
    lines: 25-74
---

# Core Service Controllers

`@zerospin/core` exposes deep modules through its `./*` package export; the
service-owned controller graph is consumed from the modules that define each
symbol rather than through a feature barrel
(../../packages/core/package.json:8-43).

## Exported factories

| Import path                                                                  | Surface                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@zerospin/core/serviceFrontendController/makeServiceFrontendController`     | Constructs a client-safe service frontend identity, version, declared service models, model names, and signature schema; it validates a nonempty version and exact service ownership of every model (../../packages/core/src/serviceFrontendController/makeServiceFrontendController.ts:12-78).                                                   |
| `@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec` | Encodes the service/actor/frontend identity, version, current and historical model definitions, indexes, and signature JSON Schema for transport and compatibility checks (../../packages/core/src/serviceFrontendController/makeServiceFrontendControllerSpec.ts:8-36).                                                                          |
| `@zerospin/core/serviceActorController/makeServiceActorController`           | Binds named service frontends and their authentication callbacks to one service actor; each frontend key, actor name, and model object must match the actor controller (../../packages/core/src/serviceActorController/makeServiceActorController.ts:20-69, ../../packages/core/src/serviceActorController/makeServiceActorController.ts:92-131). |
| `@zerospin/core/service/makeServiceController`                               | Retains an `actorControllers` registry on every service controller, defaulting the authored input to an empty registry while validating actor names, model identity, and owning service names (../../packages/core/src/service/makeServiceController.ts:58-133, ../../packages/core/src/service/makeServiceController.ts:332-388).                |
| `@zerospin/core/system/makeSystem`                                           | Validates service registry keys and every nested service frontend's owning system name before retaining the complete account and service controller graph (../../packages/core/src/system/makeSystem.ts:36-72, ../../packages/core/src/system/makeSystem.ts:125-157).                                                                             |

## Authored graph

```text
makeSystem
  serviceControllers[serviceName]
    actorControllers[actorName]
      frontends[frontendName]
        frontendController
        authenticate
```

The service frontend controller is safe to serialize, but the executable
authentication callback remains on the server-owned service actor binding
(../../packages/core/src/serviceFrontendController/makeServiceFrontendController.ts:69-78,
../../packages/core/src/serviceActorController/makeServiceActorController.ts:118-130).
That callback receives the decoded frontend signature and only a read-only
`db.query` facade typed from the service actor's declared models; the runtime
ServiceRepo narrows the registry again to those exact model queries
(../../packages/core/src/serviceActorController/makeServiceActorController.ts:31-55,
../../packages/core/src/serviceActorController/types.ts:8-20,
../../packages/system-worker/src/ServiceRepo/authenticateServiceFrontend/authenticateServiceFrontend.ts:25-74).
`makeSystemSpec` preserves the nested service actor/frontend graph while
serializing each frontend through `makeServiceFrontendControllerSpec`; it does
not serialize the authentication callback
(../../packages/core/src/system/makeSystemSpec.ts:412-453).

## Related types

The defining deep modules also expose `serviceFrontendController/types` and
`serviceActorController/types` through the package wildcard; consumers should
import those definitions directly rather than from a runtime module re-export
(../../packages/core/package.json:39-43).

See [[ServiceFrontendApi]] for the runtime admission boundary built from this
authored graph.
