# Plan 067 — Schema-validated `makeSystem` authoring

Status: active.

## Summary

1. Record this as `wiki/dev/plans/067-plan-schema-validated-make-system.md`.
2. Replace only Plan 064’s `makeSystem` slice; Plan 064’s other cleanup work remains unchanged.
3. Make Effect Schema decoding the authoring gate:
   1. Each relevant `make*` factory decodes its own props for construction-time integrity.
   2. `makeSystem` decodes the complete authored container graph and checks canonical leaves with `Schema.instanceOf`.
   3. Resolvers construct `ISystem` exclusively from decoded values.
4. This is not a repository-wide migration of every `make*` function. It covers `makeSignature`, `makeModel`, `makeReplica`, `makeContract`, and `makeFrontendController`, because their outputs are trusted leaves inside `makeSystem`.

## Implementation

1. Introduce package-internal canonical classes named `Signature`, `Model`, `Contract`, `ServiceFrontendController`, and `AggregateFrontendController`.
   1. Keep their existing fields as enumerable own properties so specs and serialization remain unchanged.
   2. Do not export or re-export these classes through the public package API.
   3. Preserve existing public factory signatures and generic inference.
   4. Have each factory strictly decode its props with `Schema.decodeUnknownSync(..., { onExcessProperty: "error" })` before constructing its canonical instance.
   5. Keep schemas used by only one factory in that factory’s module rather than creating one-consumer schema files.
2. Preserve exact model identity through replica construction.
   1. `makeModel` must return the canonical `Model` instance captured by its mutation schemas and operations.
   2. `makeReplica` must not clone or wrap that instance.
   3. Give `Model` a private replica brand and package-internal static operations `Model.markReplica(model, { sourceModel, serviceName })` and `Model.isReplica(model)`.
   4. `makeReplica` is the only writer of that brand; `makeSystem` aggregate validation is its only reader.
   5. Remove any need for a provenance `WeakSet`.
3. Add `decodeSystemProps` as the single structural decoder called by `makeSystem`.
   1. Decode the top-level authentication, services, aggregates, models, contracts, mutations, queries, selections, frontends, projection adapters, guards, and authorizers.
   2. Use strict `Schema.Struct`, `Schema.Record`, tuple, array, literal, and union schemas for authored containers.
   3. Use `Schema.instanceOf` for the five canonical leaf classes so decoding proves factory provenance without reconstructing those instances.
   4. Use declared/predicate schemas for function and Effect Schema fields while retaining their identity.
   5. Default omitted `services` to an empty decoded record as today.
   6. Use the decoded record and array snapshots as the sole construction input. Do not retain authored container identities.
4. Move the semantic graph checks into owner-specific schema decoding.
   1. Add `resolveSystemService`, called only by `makeSystem`, to validate source-model ownership, service mutation history, queries, frontend bindings, authorization, and command construction.
   2. Add `resolveSystemAggregate`, called only by `makeSystem`, to validate local models versus branded replicas, aggregate mutation history, selections, query grants, projection adapters, frontend identity, guards, authorization, and command construction.
   3. Express dependent and cross-reference invariants through dynamically contextualized Schema checks so invalid authoring consistently throws native Effect Schema errors.
   4. Preserve all existing stamped identities and returned `ISystem` fields.
   5. Do not introduce a named resolver-context type; inline or infer its internal shape.
5. After the two resolvers exist, add `decodeMutationSchemaIdentity`.
   1. It decodes `{ modelName, modelVersion, operationName }` from a mutation schema’s JSON Schema document.
   2. Its only call sites are service and aggregate mutation validation.
   3. Return its shape inline rather than adding a named type.
   4. Do not broaden this plan into replay or `makeSystemSpec` cleanup.
6. Reduce `makeSystem` runtime construction to:
   1. Decode authored props.
   2. Build the exclusive source-model ownership index.
   3. Resolve services.
   4. Resolve aggregates.
   5. Return the completed `ISystem`.

## Public behavior

1. Public TypeScript APIs and exact-name inference remain unchanged.
2. Invalid factory or system authoring now throws native Effect Schema errors with schema paths and issues; bespoke `makeSystem: ...` errors are intentionally removed.
3. Excess runtime properties are rejected instead of silently ignored.
4. Structural copies of signatures, models, replicas, contracts, or frontend controllers are rejected even when their fields look correct.
5. Valid canonical leaf objects retain reference identity through `makeSystem`.
6. Decoded containers are snapshots: mutating an authored models/contracts/frontends record after `makeSystem` returns cannot change the resulting `ISystem`.
7. This does not provide tamper detection for later mutation inside a canonical leaf instance. `makeSystem` proves factory provenance; the originating factory performed the leaf’s integrity decode.

## Tests and completion

1. Add focused factory tests proving:
   1. Valid props construct the canonical class.
   2. Invalid and excess props produce Schema errors.
   3. Existing public generic inference remains intact.
   4. `makeReplica` preserves the exact model instance while adding authenticated replica provenance.
2. Add `makeSystem` tests proving:
   1. Structural leaf copies are rejected.
   2. Canonical leaves shared across multiple bindings remain the same references.
   3. Returned containers differ from authored containers.
   4. Post-construction mutation of authored records does not alter `ISystem`.
   5. Authentication, ownership, replica, mutation-history, frontend, stamping, and authorization invariants all fail through Schema errors.
   6. Mutation coverage includes invalid identity, unsupported operations, current sources, incorrect destinations, duplicate source versions, foreign destinations, and incomplete retired-model operation sets.
   7. Valid system specs and stamped command/query identities remain unchanged.
3. Run:
   1. `nx run @zerospin/core:test --skipNxCache`
   2. `nx run @zerospin/core:ts --skipNxCache`
   3. `nx run @zerospin/core:lint --skipNxCache`
   4. `nx run system-worker:test --skipNxCache`
   5. `nx run system-worker:ts --skipNxCache`
   6. `nx run shopping:ts --skipNxCache`
   7. `nx run shopping:build --skipNxCache`
   8. `git diff --check`
4. Update `wiki/architecture/AuthoredSystem.md` to distinguish factory integrity decoding, `makeSystem` provenance checking, decoded container snapshots, and downstream lookup-and-trust.
5. Update Plan 064’s `makeSystem` item to reference Plan 067. Archive Plan 067 only after the implementation and complete verification pass; do not archive Plan 064.
