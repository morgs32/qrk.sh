---
title: Session Identity and Admission
updated: 2026-09-25
---

# Session identity and admission

An actor declares its identity schema and selection path with `makeActorIdentity({ schema, actorPath })`. The server separately declares an admission policy: `authentication: 'none'` accepts an identity supplied by the browser, while `{ credentialsSchema, authenticate }` verifies credentials and returns an identity. Aggregate verifiers can provision through `executeCommand`. Service verifiers retain their service capabilities. The selected actor's policy decides which request form is valid; mixed forms and missing policies fail.

A browser session imports `identitySchema` and, for a verified actor, `credentialsSchema`. Direct sessions initialize with `{ identity }`; verified sessions initialize with `{ getCredentials }`. The direct identity is copied at initialization. The credential provider is called for each new server admission. Credentials are never stored in session snapshots, commands, tickets, or durable node databases.

```ts
await directSession.initialize({ identity: { aggregateId, instanceId } });
await verifiedSession.initialize({
  getCredentials: () => Effect.succeed({ token }),
});
```

The browser selects the aggregate or service through the gateway, then calls `admit({ identity })` or `admit({ credentials })`. Admission validates the resulting identity against the declared schema, validates aggregate IDs, derives the actor path, and records an admission attempt. Authorization checks the current target and session lock before exposing snapshot or WebSocket operations. Failed admission attempts retain sanitized audit results.

```mermaid
sequenceDiagram
  participant Browser
  participant Gateway
  participant Actor
  participant Access
  Browser->>Gateway: select aggregate or service
  Gateway-->>Browser: selected actor capability
  Browser->>Actor: admit(identity or credentials)
  Actor->>Actor: apply policy and validate identity
  Actor-->>Browser: access bound to identity
  Browser->>Access: authorize(session name and lock)
  Access-->>Browser: session capability
```

- [`admitAggregate.ts`](../../../packages/system-worker/src/AggregateApi/admit/admitAggregate/admitAggregate.ts) and [`admitService.ts`](../../../packages/system-worker/src/ServiceApi/admit/admitService/admitService.ts) implement the two server policies and common identity validation.
- [`getSnapshot.ts`](../../../packages/system-worker/src/AggregateSessionApi/getSnapshot/getSnapshot.ts) and [`getSnapshot.ts`](../../../packages/system-worker/src/ServiceSessionApi/getSnapshot/getSnapshot.ts) return the authorized identity with each snapshot.
- [`makeSession.ts`](../../../packages/browser/src/makeSession/makeSession.ts) and [`makeAdmissionProvider.ts`](../../../packages/browser/src/makeSession/makeAdmissionProvider.ts) capture direct identity and supply fresh credentials.

## Durable nodes and recovery

The SharedWorker creates a durable node key from the admitted identity, target, backend, and full definition lock. A tab decodes the returned identity before publishing session state. The node stores identity with commands and uses it for replay and reconnect. Its offline catalog locator remembers the last admitted node for a session definition; it is a local recovery aid, not server proof. When a direct session reopens offline, the remembered identity must match the value captured at initialization.

A node obtains a fresh admission request from an attached tab when it reconnects. Eligible tabs respond concurrently, with bounded waits. Only a server response for the node's exact identity can resume synchronization. `clearAuthentication()` suspends the node, invalidates pending attempts, closes sockets, and disables offline restoration while retaining command databases for a later login.

- [`NodeHost.ts`](../../../packages/browser/src/Node/NodeHost.ts) binds attachment, identity checking, and offline lookup.
- [`NodeAuthentication.ts`](../../../packages/browser/src/Node/NodeAuthentication.ts) coordinates admission providers and verifies the server's returned identity.
- [`NodeCatalog.ts`](../../../packages/browser/src/Node/NodeCatalog.ts) retains admitted definitions and offline locators.

Cold server activation reconstructs only the actor selection fields from the canonical path; it does not run `authenticate` or recover credentials. Commands, snapshots, tickets, and replay carry the accepted identity. Different identities may select the same actor partition, so authorization and command provenance continue to bind the complete value.

This changes fixed schemas. Reset affected server storage and browser node databases/backups before running matching client and server builds. No compatibility decoder or migration is provided.
