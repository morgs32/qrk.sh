# Contract payload history through complete own version specs

Implementation follow-up, 2026-10-25. The earlier backward-only portable `previous` proposal was rejected and is superseded by Plan 266. The framework changes are in the sibling Zerospin working tree; QRK dependencies have not been reconciled as part of this work.

1. Each contract version owns complete metadata with singular `payloadShape`, failure/result schemas, claims, models, operations and optional external facts. Portable metadata has no `previous`, `next`, `payloadShapes` or `failureSchemas`.
2. `makeSystem` finalizes every reachable runtime contract node after validation. All upgrades must be declared before composing a System using those shared declarations.
3. `makeSystemSpec` automatically compiles owner-scoped complete `contractVersions` alongside exact release/Actor/Agent bindings, including historical sources, intermediate adapter versions and reachable descendants. It returns one frozen canonical snapshot with its hash. No author-maintained history object or registry is needed.
4. The whole SystemSpec is accepted atomically and retained by hash. Internal immutable-fact comparisons happen during acceptance. Startup and session tickets use accepted-hash membership; replay has no acceptance-comparison RPC.
5. If the contract is not on an aggregate/service release it's not supported. New commands require the exact version on their addressed release. Historical codec presence permits decoding/adaptation without adding fresh-command support.
6. Verification extends existing framework test seams without adding test/fixture/runner files or resetting storage. Omitted-history materialization uses the existing replay-domain/database seam; startup and acceptance are verified separately. Publication, QRK dependency reconciliation and Cloud's deferred page/verification remain separate work.

- [Current implementation research](../../../zerospin/wiki/research/system-spec-hash-construction.md)
- [Complete SystemSpec compiler](../../../zerospin/packages/core/src/system/make/makeSystemSpec.ts)
- [Own contract schema](../../../zerospin/packages/core/src/contracts/ContractSpecSchema.ts)
- [Canonical hash](../../../zerospin/packages/core/src/system/hashSystemSpec.ts)
- [Atomic whole acceptance](../../../zerospin/packages/system-worker/src/SystemRepo/acceptSystemSpec/acceptSystemSpecTx.ts)
- [Plan 266](../../../zerospin/wiki/archive/plans/266-plan-independent-contract-version-specs.md)
