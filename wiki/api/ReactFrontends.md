---
title: React Frontends
type: api
updated: 2026-07-28
sources:
  - path: packages/react/package.json
    sha: a706deedd7ddb5bf5ae9ea5a5efbfec91b02cfc3
    lines: 8-13
  - path: packages/react/src/makeReactFrontend.ts
    sha: c718f318c46bfd16063d4fed46bd2a4f40a39e6a
    lines: 63-121
  - path: packages/frontend/src/authenticate.ts
    sha: 3979f3541656b870901b3813ce63ff94a54d3ae7
    lines: 19-54
  - path: packages/react/src/makeReactServiceFrontend.ts
    sha: ff1777c1f80ab14ae3d0f1f30aa1375c8fb1727d
    lines: 23-90
  - path: packages/react/src/makeServiceProvider.tsx
    sha: 3c7c6994ebf43830b132e344bb19763373fdf7f8
    lines: 38-177
  - path: packages/react/src/ZerospinConfig.tsx
    sha: 233f700d012ecd2d71a0f30b810dce81d8a59b50
    lines: 23-279
  - path: packages/devtools/src/zerospinDevtoolsController.ts
    sha: cf6c7227acddbc4a45189267554bfd7971d810e5
    lines: 1-107
  - path: packages/react/src/makeBrowserPartitionController.ts
    sha: 36cc769ebd0dc62c8569a84c7de9ffd8e9cd3cb4
    lines: 340-5739
  - path: packages/react/src/bootstrapBrowserServiceSession.ts
    sha: b16249bef7b9ad9207d90f587f3a044e447bda35
    lines: 36-2458
  - path: packages/react/src/useCommissionFrontendReplica.ts
    sha: 21d08dda77eb1b4546b0f3bd0921333570193ac1
    lines: 45-1041
  - path: packages/react/src/bootstrapBrowserSession.ts
    sha: bf4eca2adac3e17dab890877fb0ced80e3a62528
    lines: 55-3455
  - path: packages/react/src/acquireFrontendWebSocket.ts
    sha: af08d68747ba61629b37af6e0c12057c44cf42b3
    lines: 195-877
  - path: packages/react/src/acquireServiceFrontendWebSocket.ts
    sha: 672893661d59941da2e047707f13b4bb9d5a299f
    lines: 215-903
  - path: packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts
    sha: 491f7e4055485cd66fe9ff63449190be2fcba395
    lines: 1992-3869
---

# React Frontends

`@zerospin/react` exposes each defining module through its `./*` package export;
the service frontend factory, provider, bootstrap program, and commissioning hook
are separate deep imports rather than a new feature barrel
(../../packages/react/package.json:8-13).

## Account frontend factory

`@zerospin/react/makeReactFrontend` returns the account Provider/context/runtime
surface and a public `authenticate(signature)` Promise for work that must happen
before any Provider or `ZerospinConfig` exists. That handshake runs the
standalone frontend `authenticate` Effect with the factory's compiled controller
and runtime services; the underlying admission validates the compiled target,
returns actor plus deploy/generation/system identity, and releases both RPC
targets before the Promise settles
(../../packages/react/src/makeReactFrontend.ts:63-121,
../../packages/frontend/src/authenticate.ts:19-54).

## Service frontend factory

`@zerospin/react/makeReactServiceFrontend` returns a `kind: 'service'` frontend
with its typed Provider and context, model-ID functions, initialized-state hook,
Effect runtime, and synchronous runtime runner
(../../packages/react/src/makeReactServiceFrontend.ts:23-90).

The generated Provider requires an enclosing `ZerospinConfig` and rejects only a
nested Provider for the same React context. Sibling Providers are allowed and
intentionally own separate main-thread service sessions and databases. Bootstrap
is one-shot; unmount releases only that Provider's browser session and removes
its DevTools registration
(../../packages/react/src/makeServiceProvider.tsx:53-85,
../../packages/react/src/makeServiceProvider.tsx:101-151,
../../packages/react/src/makeServiceProvider.tsx:153-176).

## Config-owned authentication and replicas

`ZerospinConfig` requires a `partitionKey` and a frontend-authenticator registry
whose keys match each account or service frontend name. Each account and service
bootstrap obtains its signature generator from this Config-owned registry and
validates the generated value against that frontend's signature schema. Config
constructs one partition controller for the key/mode pair, defaults to direct
mode, reads the current registry through a ref, provides that controller through
context, and releases it after unmount
(../../packages/react/src/ZerospinConfig.tsx:93-143,
../../packages/react/src/bootstrapBrowserSession.ts:79-113,
../../packages/react/src/bootstrapBrowserServiceSession.ts:46-76).

While mounted, Config also installs the narrow
`window.zerospin.devtools.open()` console surface. The DevTools React shell is
not imported or rendered until that method is called; concurrent callers share
one opening Promise, an already-mounted shell is preferred, and Config cleanup
restores the prior window property while rejecting unfinished load/mount work
(../../packages/react/src/ZerospinConfig.tsx:145-235,
../../packages/react/src/ZerospinConfig.tsx:262-278,
../../packages/devtools/src/zerospinDevtoolsController.ts:1-107).

The public partition-controller surface keeps account and service provider
operations distinct: account replicas may fetch state, mint tickets, and push
commands, while service replicas may only fetch state and mint tickets. These
are stable provider callbacks, not retained admitted APIs; each callback obtains,
validates, uses, and releases a fresh actor-bound capability
(../../packages/react/src/makeBrowserPartitionController.ts:340-448,
../../packages/react/src/bootstrapBrowserSession.ts:1231-1625,
../../packages/react/src/bootstrapBrowserServiceSession.ts:961-1213).

`bootstrapBrowserSession` and `bootstrapBrowserServiceSession` are distinct
account and service lifecycles. Both attempt online admission first and permit
an exact cached SharedWorker locator only for a classified transport failure;
authentication or authorization rejection, an authoritative identity mismatch,
any signature-schema rejection, or an initial same-version compiled-spec
mismatch invalidates matching cached authority and remains a failure. A
same-principal frontend-version change preserves locators, while ordinary state,
ticket, push, transport, or repair failures propagate without cache revocation.
Account acquisition carries state, ticket, and push operation callbacks; service
acquisition carries only state and ticket callbacks. Direct mode uses in-memory
SQLite plus one provider-owned socket instead of the SharedWorker catalog
(../../packages/react/src/bootstrapBrowserSession.ts:75-170,
../../packages/react/src/bootstrapBrowserSession.ts:1141-1625,
../../packages/react/src/bootstrapBrowserServiceSession.ts:36-121,
../../packages/react/src/bootstrapBrowserServiceSession.ts:888-1213).

Every active SharedWorker acquisition also retains a serialized transport-regain
callback. Exact-generation reauthentication keeps that acquisition. A changed
generation creates a second active target acquisition with newly admitted
one-shot operations, and the controller transfers the mounted account or
service session only after the target lineage handoff succeeds. A failed handoff
preserves the readable source replica and its account journal
(../../packages/react/src/bootstrapBrowserSession.ts:1627-2206,
../../packages/react/src/bootstrapBrowserServiceSession.ts:1215-1633,
../../packages/react/src/makeBrowserPartitionController.ts:2974-3716,
../../packages/react/src/makeBrowserPartitionController.ts:4928-5180).

An authoritative provider rejection removes every matching active and
commissioned locator across versions and tears down matching main-thread
sessions, but preserves persistent replica and journal bytes. The encoded
rejection returns before the worker acquisition release is scheduled, so the
provider callback never waits on the worker that invoked it
(../../packages/react/src/makeBrowserPartitionController.ts:2014-2218).

## Update-required sessions

The partition controller detects authoritative same-generation frontend-version
changes through state, ticket, and account-push results and marks every mounted
session for that replica `update-required`. The account and service Providers
keep exposing their existing readable databases while their sockets continue
archive replay; service remains read-only, and account writes are no longer
admitted until matching code acquires or commissions the authoritative version
(../../packages/react/src/makeBrowserPartitionController.ts:949-1227,
../../packages/react/src/makeBrowserPartitionController.ts:1403-1586,
../../packages/react/src/acquireFrontendWebSocket.ts:274-417,
../../packages/react/src/acquireServiceFrontendWebSocket.ts:290-433,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:1992-2060,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:3170-3369,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:3838-3869).

## Commissioning hook

`@zerospin/react/useCommissionFrontendReplica` accepts either a typed account or
service React frontend and returns explicit asynchronous `commission()` and
`release()` operations. Commissioning requires SharedWorker mode
(../../packages/react/src/useCommissionFrontendReplica.ts:45-80,
../../packages/react/src/useCommissionFrontendReplica.ts:110-127).

The hook admits and compares the compiled spec before acquiring a commissioned
replica. It releases the initial admitted API before acquisition, then retains
commission ownership plus account state/ticket/push or service state/ticket
operation callbacks; every later operation performs fresh one-shot admission.
`release()` records the request without waiting for an in-flight commission,
releases an existing owner immediately, and releases a later successful account
or service acquisition exactly once
(../../packages/react/src/useCommissionFrontendReplica.ts:142-615,
../../packages/react/src/useCommissionFrontendReplica.ts:650-976).

For a commissioned account candidate with predecessors, the partition
controller records each exact source target through an empty command import
before `commission()` resolves. If that persistence fails, the controller
removes and releases that exact commission owner so it cannot strand the only
SharedWorker registration or network capability
(../../packages/react/src/makeBrowserPartitionController.ts:2765-2890).

See [[bootstrapBrowserSession]] for browser lifecycle architecture and
[[ServiceFrontendProjection]] for the service replica's server source.
