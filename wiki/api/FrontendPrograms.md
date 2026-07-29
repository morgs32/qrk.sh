---
title: Frontend Programs
type: api
updated: 2026-07-28
sources:
  - path: packages/frontend/package.json
    sha: 6f2ce8952307750d3327e37656037c283b35aec6
    lines: 12-67
  - path: packages/frontend/src/fetchFrontend.ts
    sha: 25e7560ddc54abb13e082c5530be3eccef39936d
    lines: 30-193
  - path: packages/frontend/src/authenticate.ts
    sha: 3979f3541656b870901b3813ce63ff94a54d3ae7
    lines: 19-54
  - path: packages/frontend/src/pushFrontendCommands.ts
    sha: 1832676abd5fe2360d11f00a22314cb81ad72fd1
    lines: 17-45
  - path: packages/frontend/src/fetchServiceFrontend.ts
    sha: 98cd63865af04ca33b1e619541e268be030dc85d
    lines: 23-184
  - path: packages/frontend/src/fetchServiceFrontendState.ts
    sha: aa549596c692e9b8b182c442537e93d504ae4a5f
    lines: 12-36
  - path: packages/frontend/src/createServiceFrontendWebSocketTicket.ts
    sha: 437e25741b80ce8ce02c1a9a2c4735f9e86614c8
    lines: 13-46
  - path: packages/frontend/src/fetchFrontendState.ts
    sha: 59f539769bc61e861f8c29016b85551ac2cbaa84
    lines: 12-31
  - path: packages/frontend/src/createFrontendWebSocketTicket.ts
    sha: 2884e31d7862c370d532e4c631cce3f94ea050d2
    lines: 13-43
  - path: packages/system-worker/src/createFrontendWebSocketTicket/createFrontendWebSocketTicket.ts
    sha: e412e8734eb3e77a19930016f10516ed148e3521
    lines: 25-418
  - path: packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts
    sha: 7c5d036a67378072550af1a57d7afa0611b89e32
    lines: 28-452
---

# Frontend Programs

`@zerospin/frontend` exposes browser transport programs as explicit deep package
exports. The service-owned additions are separate from the account programs;
there is no generic account/service client wrapper
(../../packages/frontend/package.json:12-62).

## Admission programs

`fetchFrontend` admits an account frontend, reads its actor identity and exact
frontend spec, validates the returned compiled target, and returns the live
capability with an idempotent `releaseFrontendApi` that disposes both the leaf
and root Cap'n Web targets
(../../packages/frontend/src/fetchFrontend.ts:30-64,
../../packages/frontend/src/fetchFrontend.ts:92-193).

`authenticate` is the one-shot account handshake for callers that need identity
before mounting a Provider. It supplies the caller's exact signature to
`fetchFrontend`, returns only actor/deploy/generation/system metadata, and
releases the admitted capability immediately. It is a frontend package program,
not another `FrontendApi` RPC leaf
(../../packages/frontend/src/authenticate.ts:19-54).

`fetchServiceFrontend` performs the distinct service admission. Its result
contains the authenticated actor/system/generation/service/frontend identity,
the service frontend spec, the two-leaf service capability, and the same
explicit transport release boundary
(../../packages/frontend/src/fetchServiceFrontend.ts:23-56,
../../packages/frontend/src/fetchServiceFrontend.ts:93-181).

## Bound capability programs

| Import path                                               | Operation                                                                                                                                                                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@zerospin/frontend/fetchFrontendState`                   | Invokes the admitted account capability's empty-argument state leaf and returns the complete account sync state used for creation or repair (../../packages/frontend/src/fetchFrontendState.ts:12-31).                      |
| `@zerospin/frontend/createFrontendWebSocketTicket`        | Mints a fresh one-use account archive ticket whose complete identity is checked again by the browser socket owner (../../packages/frontend/src/createFrontendWebSocketTicket.ts:13-43).                                     |
| `@zerospin/frontend/fetchServiceFrontendState`            | Invokes the admitted service capability's empty-argument state leaf and maps transport/domain failures into `IAnyError` (../../packages/frontend/src/fetchServiceFrontendState.ts:12-36).                                   |
| `@zerospin/frontend/createServiceFrontendWebSocketTicket` | Invokes the empty-argument ticket leaf and returns the ticket with complete system/generation/service/actor/frontend identity (../../packages/frontend/src/createServiceFrontendWebSocketTicket.ts:13-46).                  |
| `@zerospin/frontend/pushFrontendCommands`                 | Sends full encoded staged account commands through an already-admitted account capability and returns the pending, pushed, and failed full command collections (../../packages/frontend/src/pushFrontendCommands.ts:17-45). |

The package manifest exposes the one-shot account handshake plus the account and
service admission, state, command, and ticket programs as independent
entrypoints
(../../packages/frontend/package.json:18-67).

## Authority-bearing results

These programs preserve the admitted capability's result instead of selecting a
target locally. State and account push remain bound to the capability's source,
while ticket creation may return a verified successor generation or a newer
frontend version in the same generation. Both ticket programs return that full
authoritative identity for the React socket owner to validate and surface as a
lineage transition or `update-required`
(../../packages/frontend/src/createFrontendWebSocketTicket.ts:13-43,
../../packages/frontend/src/createServiceFrontendWebSocketTicket.ts:13-46,
../../packages/system-worker/src/createFrontendWebSocketTicket/createFrontendWebSocketTicket.ts:38-418,
../../packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts:82-452).

See [[FrontendApi]] and [[ServiceFrontendApi]] for the corresponding gateway
capabilities.
