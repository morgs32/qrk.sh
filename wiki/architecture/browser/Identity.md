---
title: Session Claims and Admission
updated: 2026-09-27
---

# Session claims and admission

**Claims** are the full authenticated object, including partition fields. **Identity** is the subset selected by `actorPath`; it determines the actor partition within its existing owner scope. `makeActorIdentity` exposes `claimsSchema` for the full object and derives `identitySchema` for the path fields. Extra claims do not change the actor partition. No public/private visibility distinction is implied.

An actor declares its full claims schema and partition path with `makeActorIdentity({ claims, actorPath })`. The server separately declares an admission policy: `authentication: 'none'` accepts an claims supplied by the browser, while `{ credentialsSchema, authenticate }` verifies credentials and returns an claims. Aggregate verifiers can provision through `executeCommand`. Service verifiers retain their service capabilities. The selected actor's policy decides which request form is valid; mixed forms and missing policies fail.

A browser session imports `claimsSchema` and, for a verified actor, `credentialsSchema`. Direct sessions initialize with `{ claims }`; verified sessions initialize with `{ getCredentials }`. The direct claims is copied at initialization. The credential provider is called for each new server admission. Credentials are never stored in session snapshots, commands, tickets, or durable node databases.

```ts
await directSession.initialize({ claims: { aggregateId, instanceId } });
await verifiedSession.initialize({
  getCredentials: () => Effect.succeed({ token }),
});
```

The browser selects the aggregate or service through the gateway, then calls `admit({ claims })` or `admit({ credentials })`. Admission validates the resulting claims against the declared schema, validates aggregate IDs, derives the actor path, and records an admission attempt. Authorization checks the current target and session lock before exposing snapshot or WebSocket operations. Failed admission attempts retain sanitized audit results.

```mermaid
sequenceDiagram
  participant Browser
  participant Gateway
  participant Actor
  participant Access
  Browser->>Gateway: select aggregate or service
  Gateway-->>Browser: selected actor capability
  Browser->>Actor: admit(claims or credentials)
  Actor->>Actor: apply policy and validate claims
  Actor-->>Browser: access bound to claims
  Browser->>Access: authorize(session name and lock)
  Access-->>Browser: session capability
```

- [`admitAggregate.ts`](../../../packages/system-worker/src/AggregateApi/admit/admitAggregate/admitAggregate.ts) and [`admitService.ts`](../../../packages/system-worker/src/ServiceApi/admit/admitService/admitService.ts) implement the two server policies and common claims validation.
- [`getSnapshot.ts`](../../../packages/system-worker/src/AggregateSessionApi/getSnapshot/getSnapshot.ts) and [`getSnapshot.ts`](../../../packages/system-worker/src/ServiceSessionApi/getSnapshot/getSnapshot.ts) return the authorized claims with each snapshot.
- [`makeSession.ts`](../../../packages/browser/src/makeSession/makeSession.ts) and [`makeAdmissionProvider.ts`](../../../packages/browser/src/makeSession/makeAdmissionProvider.ts) capture direct claims and supply fresh credentials.

## Durable nodes and recovery

The SharedWorker creates a durable node key from the admitted claims, target, backend, and full definition lock. A tab decodes the returned claims before publishing session state. The node stores claims with commands and uses it for replay and reconnect. Its offline catalog locator remembers the last admitted node for a session definition; it is a local recovery aid, not server proof. When a direct session reopens offline, the remembered claims must match the value captured at initialization.

A node obtains a fresh admission request from an attached tab when it reconnects. Eligible tabs respond concurrently, with bounded waits. Only a server response for the node's exact identity can resume synchronization. `clearAuthentication()` suspends the node, invalidates pending attempts, closes sockets, and disables offline restoration while retaining command databases for a later login.

- [`NodeHost.ts`](../../../packages/browser/src/Node/NodeHost.ts) binds attachment, claims checking, and offline lookup.
- [`NodeAuthentication.ts`](../../../packages/browser/src/Node/NodeAuthentication.ts) coordinates admission providers and verifies the server's returned claims.
- [`NodeCatalog.ts`](../../../packages/browser/src/Node/NodeCatalog.ts) retains admitted definitions and offline locators.

Cold server activation reconstructs only the actor selection fields from the canonical path; it does not run `authenticate` or recover credentials. Commands, snapshots, tickets, and replay carry the accepted claims. Different claims may select the same actor partition, so authorization and command provenance continue to bind the complete value.

This changes fixed schemas. Reset affected server storage and browser node databases/backups before running matching client and server builds. No compatibility decoder or migration is provided.
