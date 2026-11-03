# Zerospin session locks: identities versus schema shapes

Researched 2026-11-03 against QRK's installed Zerospin `38.2.2` and the owning
`../zerospin` source. Research only; no implementation, storage access, deployment,
or reset was performed. The inspected core lock, projection, visibility-validation,
and contract-construction source files match the installed package.

## Finding

**Browser session locks can use scoped names and versions instead of complete
schema shapes.** Shapes currently provide an additional check for mismatched
declarations using the same identity. They are not the source of Actor authority.
The server already resolves the owner release, Actor, selected models, and selected
contracts from its own declarations before performing structural lock equality.
[Owner resolution](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateVersionRepo/authorizeSession/authorizeSession.ts:64),
[Actor resolution and comparison](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateVersionRepo/authorizeSession/validateAggregateSessionLock.ts:33),
[member selection](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateVersionRepo/authorizeSession/selectAggregateLockMembers.ts:37).

This is a viable protocol simplification, rather than a description of the
current protocol. It must retain exact owner/Actor identities and the selected
model/contract names and versions. An unscoped command name or a session name by
itself is insufficient: contract identities are scoped by aggregate/service and
owner name. The owner release and Actor are also independently versioned.
[Immutable-fact keys](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/SystemRepo/acceptSystemSpec/acceptSystemSpecTx.ts:10),
[request identity](/Users/morgs32/GitHub/zerospin/packages/browser/src/AggregateNode/aggregateNodeRequest.ts:5).

## What the current shapes buy

1. The lock contains session name; Actor name/version and claims JSON Schema;
   model name/version, abbreviation, properties shape and indexes; and contract
   name/version, payload/failure/result/operation descriptions. It omits the owner
   and system identity, which travel alongside it in the request.
   [Lock construction](/Users/morgs32/GitHub/zerospin/packages/core/src/aggregateSession/make/makeAggregateSessionLock.ts:12),
   [member projection](/Users/morgs32/GitHub/zerospin/packages/core/src/system/project/projectSessionFacts.ts:8),
   [request](/Users/morgs32/GitHub/zerospin/packages/browser/src/AggregateNode/aggregateNodeRequest.ts:5).
2. The server checks exact Actor version, resolves requested model keys to
   `actor.exposedModels` and contract keys to `actor.contracts`, and checks exact
   versions. It also checks that selected models form a valid graph and contain
   the models required by selected contracts. These checks remain useful with an
   identity-only manifest; a session may select only part of an Actor's surface.
   [Actor version](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateVersionRepo/authorizeSession/validateAggregateSessionLock.ts:38),
   [selection and closure](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateVersionRepo/authorizeSession/selectAggregateLockMembers.ts:37).
3. It then reconstructs the expected lock from those server-owned declarations
   and deep-compares the whole lock. This catches a browser authored with, for
   example, a changed payload or wrong exposed fields under an otherwise matching
   name/version. The SharedWorker similarly compares its own declaration against
   the incoming tab request. Removing shapes gives up that extra diagnostic for
   same-identity declaration mistakes.
   [Server comparison](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateVersionRepo/authorizeSession/validateAggregateSessionLock.ts:47),
   [whole-lock equality](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/sessionLockValidation/requireSupportedSessionLock.ts:39),
   [tab/worker comparison](/Users/morgs32/GitHub/zerospin/packages/browser/src/Node/nodeExecution.ts:62).

Claims remain decoded with the server Actor's native codec, and its authorizer
runs afterward. Shape equality does not authenticate claims or replace that
authorization. The Service path follows the same resolution-then-comparison
pattern. [Claims and authorization](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateVersionRepo/authorizeSession/authorizeSession.ts:81),
[Service lock validation](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/ServiceAccessApi/authorize/authorizeServiceSession/validateServiceSessionLock/validateServiceSessionLock.ts:32).

## Version immutability already exists on the server

`SystemRepo` retains accepted SystemSpecs. For each scoped contract version,
owner release version, and Actor version, incoming portable facts must equal
every matching retained fact and every duplicate in the incoming snapshot.
It rejects differences with `system-spec-version-mismatch`. Actor facts include
exposed model descriptions, contracts, claims/identity schemas, and selections;
therefore Actor name/version already pins its portable field exposure within
that retained history. A storage reset discards the retained history against
which this check operates.
[Fact collection and retained comparison](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/SystemRepo/acceptSystemSpec/acceptSystemSpecTx.ts:10),
[Actor facts](/Users/morgs32/GitHub/zerospin/packages/core/src/declaration/makeActorSpecs.ts:43).

Limited models do keep the canonical model identity/version while exposing fewer
attributes. That does not fundamentally require transporting complete shapes:
the owner/Actor version identifies the canonical exposed projection, and the
server already selects that exact object. A model name/version alone, without
the Actor binding, would lose this distinction.
[Visibility validation](/Users/morgs32/GitHub/zerospin/packages/core/src/declaration/validateModelVisibility.ts:12),
[server chooses Actor exposure](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/AggregateVersionRepo/authorizeSession/selectAggregateLockMembers.ts:40).

## A structural hash never proves executable equivalence

The current hash already cannot detect arbitrary changed behavior under the same
version. Contract lock projection only copies portable spec fields. Guard and
program callbacks are stored separately and passed into the evaluator; neither
callback body enters the lock. JSON attribute codecs are reduced to JSON Schema,
so the hash does not encode executable transformation bodies either. Native
codec identity is checked within one declaration graph for JSON model fields,
but that object-identity check cannot cross the browser/server JSON protocol.
[Lock projection](/Users/morgs32/GitHub/zerospin/packages/core/src/system/project/projectSessionFacts.ts:31),
[spec versus callbacks](/Users/morgs32/GitHub/zerospin/packages/core/src/contracts/make/constructContractRelease.ts:312),
[callback storage](/Users/morgs32/GitHub/zerospin/packages/core/src/contracts/make/constructContractRelease.ts:360),
[JSON codec projection](/Users/morgs32/GitHub/zerospin/packages/shapes/src/encodeShape.ts:111),
[native codec identity check](/Users/morgs32/GitHub/zerospin/packages/core/src/declaration/validateModelVisibility.ts:47).

Consequently both designs rely on correct versioning for semantic changes.
The additional guarantee provided by current shapes is portable structural
equality, not equal runtime behavior.

## Storage and startup implications

Today the connected Node's `definitionHash` hashes the complete lock; the Node's
session key hashes its identity, including that hash and verified claims. The
session key selects the browser storage namespace. Thus a shape change currently
selects different storage even if authors reuse every version number. An
identity-only design would reuse storage for the same identity and selection;
declaration changes must advance their version. Framework storage-format changes
remain a separate concern: current namespaces already include
`sharedWorkerVersion`.
[Definition hash](/Users/morgs32/GitHub/zerospin/packages/browser/src/AggregateNode/makeAggregateNodeDefinition.ts:21),
[JSON hash](/Users/morgs32/GitHub/zerospin/packages/core/src/Node/sessionKey.ts:16),
[storage opening](/Users/morgs32/GitHub/zerospin/packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts:101),
[namespace format](/Users/morgs32/GitHub/zerospin/packages/browser/src/Node/nodeStorageNamespaces.ts:3).

Browser lock projection is runtime work: connected Aggregate initialization
constructs the outgoing lock, replica opening projects it again, and SharedWorker
execution projects it for comparison. `makeAggregateSessionSpec` calls the lock
projector, which currently generates claims JSON Schema and consumes eagerly
generated model/contract specs. This demonstrates another consumer of JSON
Schema; it does **not** establish that removing these locks alone fixes Worker
module-startup CPU cost.
[Initialization boundary](/Users/morgs32/GitHub/zerospin/packages/browser/src/makeConnectedAggregateSession.ts:126),
[outgoing lock](/Users/morgs32/GitHub/zerospin/packages/browser/src/makeConnectedAggregateSession.ts:221),
[replica opening](/Users/morgs32/GitHub/zerospin/packages/browser/src/sessionReplica/openAggregateReplica.ts:24),
[spec projection](/Users/morgs32/GitHub/zerospin/packages/core/src/aggregateSession/make/makeAggregateSessionSpec.ts:6).

The supported simplification is to resolve a small identity/selection manifest
against canonical server declarations and use it for browser identity too.
Removing shapes from locks removes this particular obstacle to deferring JSON
Schema projection to `makeSystemSpec`; other runtime `.spec` consumers, including
SQL/resource codecs, need a separate audit before broader constructor changes.
This would be a deliberate protocol change; no such change has been implemented
by this investigation.
