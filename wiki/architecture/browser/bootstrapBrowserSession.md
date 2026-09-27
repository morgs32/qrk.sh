# Browser session bootstrap

An application declares a session with a lazy `sharedWorker: ({ name }) => new SharedWorker(new URL('./zerospin.worker.ts', import.meta.url), { type: 'module', name })` factory. Its worker entry imports `makeSharedWorker` and the bundled `sqlite.wasm?url`, then calls `makeSharedWorker({ sqliteWasmUrl })`. Runtime assets are ordinary application assets; the API server does not serve worker code.

## Workflow

1. Initialization captures direct claims or optional expectedClaims and a fresh credential provider. Server snapshot admission resolves the complete identity before selecting storage. Only classified network unavailability permits offline discovery with explicit expected claims.
2. The runtime-scoped IndexedDB discovery index locates exactly one previously verified identity for the configuration, claims, and full lock. It stores identity metadata and eligibility, never credentials or command bytes.
3. The complete identity hashes to sessionKey. The factory receives `zerospin:${sharedWorkerVersion}:${sessionKey}`. Worker, storage, and lifetime lock are isolated by this pair.
4. SharedWorkerApi exposes readiness/version and validates attachment identity. One worker owns one Node. Concurrent attachments serialize initialization; different identities cannot attach to it.
5. A new database generates a prefixed nodeId and commits its initial resource baseline before offline eligibility is published. Existing nodes recover with their own nodeId. Pending work is never replaced by an identity-discovery snapshot.
6. BrowserSessionApi represents each tab connection. Its subscription rebuilds the tab's synchronous resource projection and replays pending commands. Disposal detaches only that connection. Last detach stops synchronization; a later attachment reuses the worker.
7. clearAuthentication revokes this identity across tabs, invalidates offline discovery, and preserves stored work. Revision checks prevent stale login results from undoing logout. Fresh initialization and successful server verification can reopen it.
8. Worker termination triggers reconnection to the same identity and a new snapshot. Older locks resume only when explicitly opened; other runtime versions never read or recover this storage.

```mermaid
sequenceDiagram
  participant Tab
  participant Server
  participant Discovery
  participant SharedWorkerApi
  participant Node
  Tab->>Server: snapshot admission
  Server-->>Tab: verified claims and target
  Tab->>SharedWorkerApi: create named worker; ready; attach
  SharedWorkerApi->>Node: open exact identity database
  Node->>Discovery: publish initialized identity eligibility
  SharedWorkerApi-->>Tab: BrowserSessionApi
  Tab->>Node: subscribe through attachment
  Node-->>Tab: committed snapshot and changes
```

## Source

- [Connection lifecycle](../../../packages/browser/src/connectBrowserNode.ts)
- [Identity resolution](../../../packages/browser/src/Node/resolveNode.ts)
- [Discovery index](../../../packages/browser/src/Node/sessionDiscovery.ts)
- [Worker ownership](../../../packages/browser/src/makeSharedWorker.ts)
- [Aggregate projection](../../../packages/browser/src/bootstrapAggregateSession.ts)
- [Service projection](../../../packages/browser/src/bootstrapServiceSession.ts)
