# Scoped command validation and yieldable errors

**Date:** 2026-09-22
**Status:** Archived at the maintainer’s request on 2026-09-23; implementation present, acceptance verification deferred.

See the [implementation plan](./005-plan-scoped-command-validation-and-yieldable-errors.md#archive-checkpoint--2026-09-23) for the archive checkpoint and [TODOS.md](../../../TODOS.md#plans-005006007--deferred-acceptance-verification) for outstanding verification.

## Problem Statement

Contracts declare possible business failures. Exhaustive implementation coverage at the aggregate boundary is deferred as of 2026-09-23. Guards currently use shared error signatures that erase their actual failure subsets, and aggregate guard services can replace actor defaults. Validation cannot yet be invoked independently at the session, actor-snapshot, and whole-replica boundaries described here.

Framework errors are currently plain objects. Restoring local yieldability must not expose Error instances, stacks, or diagnostic causes through API envelopes. Scoped business failures must remain distinguishable from infrastructure failures even though both extend ZerospinError.

## Solution

1. Contracts own the failure schema. Guards supplied by contracts, actors, and aggregates compose. Callbacks may emit only declared business failures in their owning scope; programs may emit declared ContractError failures. Exhaustive implementation coverage is deferred.
2. Define ContractError, ActorError, and AggregateError categories, with literal scopes contract, actor, and aggregate. The guard declaration owner fixes its category and execution context: contract callbacks run on session/selected-snapshot state, actor callbacks on the whole AAVR replica, and aggregate callbacks on authoritative AVR state.
3. Expose standalone validation methods for UI and arbitrary callers, and reuse validation in pushed-command admission. Validation success means only that the checks in that method's scope passed; there is no outstanding-checks result inventory.
4. Validate dependent commands using speculative writes inside a transaction that always rolls back. Authoritative execution reruns programs in order against actual state, isolating each command's business failure with a savepoint.
5. Restore yieldable Error instances locally and explicit plain JSON errors at envelopes and getApi boundaries.

## User Stories

1. As a contract author, I can specify the complete failure union without implementing every check at the contract declaration.
2. As a contract author, I can supply snapshot-based checks that also work against browser session data and authentication; actor-authored checks can use the whole AAVR replica.
3. As an aggregate author, I compose scoped checks while allowing declared failure members to remain unimplemented; exhaustive coverage checking is deferred.
4. As a browser developer, I can validate a command without staging, pushing, or persisting it, and use the result for a disabled button or validation message.
5. As a server developer, I can validate replica-wide conditions in AAVR without querying the authoritative repo for those checks.
6. As an aggregate author, I can enforce sufficient funds atomically with a debit, without running that authoritative check predictively in the browser or AAVR.
7. As a caller pushing dependent commands, I can validate later commands against earlier speculative mutations without persisting the speculative state.
8. As a caller, I receive durable business-failure outcomes, and one failed command does not prevent unrelated later commands from executing.
9. As an Effect author, I can yield an error directly without losing its specific code, scope, or extra type.
10. As an API consumer, I receive typed serialized failure data without remote stack traces or diagnostic cause text.

## Implementation Decisions

### Runtime and serialized errors

1. ZerospinError is an actual Error with Effect yieldability. IZerospinError keeps CODE as its only type parameter. Existing diagnostic fields remain local; the base extra field remains a nullable record.
2. ContractError<CODE, EXTRA>, ActorError<CODE, EXTRA>, and AggregateError<CODE, EXTRA> extend ZerospinError<CODE>. Each fixes its own literal scope to contract, actor, or aggregate. A caller cannot choose a different scope for a category-specific class. EXTRA must fit the base nullable-record shape.
3. The scope field exists at runtime and in the schema. Scoped errors preserve their exact extra shape. Error schemas and constructors must preserve the full subclass type through direct yield, Effect.fail, and composition.
4. Restore IZerospinErrorJson<CODE> as the explicit data representation. Infer scoped business-error JSON types directly from their codecs, retaining scope and the schema-encoded extra shape; do not add a separate generic scoped-JSON alias. Serialization selects approved fields: \_tag, code, message, status, extra, and scope for scoped errors. It omits stack, diagnostic cause, prototype behavior, and arbitrary own properties.
5. Contract codecs define the allowed business extra payload. Framework extra must be serialized as data, not arbitrary Error instances. Diagnostic stack/cause objects must not leak through nested extra values. This is a boundary encoding responsibility, not a new framework-extra schema registry.
6. encodeRpcOutcome replaces settleResult and serializes success/failure outcomes; decodeRpcOutcome replaces readResult and propagates received JSON through Effect without reconstructing an Error. Result and RPC envelopes contain serialized failures. getApi exposes serialized failures in its Effect error channel, including locally produced API transport/selection/response failures. It does not implicitly reconstruct remote yieldable instances. Yielding an API Effect still propagates its JSON failure normally.
7. Local runtime error types and JSON boundary types must not be conflated. Deserializing an envelope does not claim that its failure has a custom prototype or iterator. Any internal reconstruction needed for execution must be explicit and schema validated.
8. Classification uses the declared business schema and scope, rather than treating every ZerospinError as infrastructure. Malformed or undeclared business errors fail validation. Infrastructure failures, defects, and interruption must not become durable business refusals merely because they share an error superclass.

### Failure constraints and guard composition

1. The contract failure schema is the source of truth for its declared business-error union. Each guard can return a subset of that union, confined to one scope. Program business failures are ContractError only.
2. Type callback inputs from the bound models, payload, and authentication. Constrain emitted business errors to the contract's declared failure union and the declaration owner's scope, including extra shape. The broad framework error base must not bypass these constraints.
3. **Deferred as of 2026-09-23:** Do not enforce that every declared failure is represented by a guard or program implementation, including at aggregate construction. Empty guards, omitted programs, and unimplemented declared failure members are valid.
4. Do not require capture of each callback's narrower error subset solely for exhaustive coverage. Preserve precise local yield types and the declared runtime/JSON failure types.
5. Contract, actor, and aggregate guards compose by retaining each owner callback; later definitions do not replace earlier checks. Use contract.guard, actor.guards[commandName], and aggregate.guards[actorName][commandName], each a direct callback with typed db, payload, and authentication. Do not use descriptor arrays or callback scope selectors. During AAVR validation run contract guard, actor guard, then program; during AVR execution run aggregate guard then program. Report the first applicable failure.
6. Error constraints remain specific to each actor/contract binding. An error declared only by another command is not permitted by that declaration.
7. Error-class inheritance supplies runtime behavior; type aliases or intersections alone do not implement yieldability. Contract and failure codecs must accept the new runtime instances and encode their public data explicitly.

### Validation contexts

1. ContractError checks consume an actor-selected snapshot and authentication. Contract guards and programs run on session data or an equivalent selected snapshot on AAVR. Running on the server must not expose unselected rows to these checks.
2. ActorError checks are declared on the actor and consume the whole replica database on AAVR. They do not run in the browser or query AVR as a fallback.
3. AggregateError checks are declared on the aggregate and run only against current authoritative AVR state in the transaction applying the command. There are no predictive aggregate checks on sessions or AAVR.
4. Program business failures are ContractError. Programs also rerun against actual AVR state during ordered execution; they do not inherit aggregate-guard responsibilities.
5. Authentication observed locally supports UI validation; admission independently establishes trusted server authentication. Client success is not server authorization.
6. validateSessionCommand runs the contract guard and program on session data. validateActorCommand runs the contract guard on the selected snapshot, the actor guard on the whole AAVR replica, then the program on the snapshot. validateAggregateCommand is an internal AVR transaction helper for the aggregate guard, not a standalone predictive endpoint. Success is scoped to the method; do not return an outstanding-check inventory.
7. Standalone session/AAVR validation returns success or the first typed serialized failure without adding history, staging optimism, pushing, broadcasting, or retaining speculative mutations. Required missing dependencies or infrastructure problems fail explicitly.
8. Reuse synchronous execution. Programs read state and return mutation descriptions. Standalone validators can be called independently and repeatedly for UI decisions. Prefer direct yield of errors and API Effects: `yield* AccountNotOwned.make({ extra: { accountId } });` and `yield* api.withdraw({ accountId, amount });`.

### Speculative pushed-command validation

1. Include AAVR checks in the push path. Validate trusted authentication and contract binding before running contract and actor checks. Do not hold a local SQL transaction across remote calls.
2. For an ordered validation batch, use an outer transaction that always rolls back. Evaluate a command's applicable guards and program, apply successful mutation descriptions temporarily, then evaluate the next command against that speculative state.
3. Contract checks and programs use the selected view of speculative state; actor checks use the full replica view. Snapshot restriction must apply to actual query visibility, not only a narrower TypeScript interface.
4. Use per-command savepoints inside the speculative transaction so a failed command leaves no partial changes visible to later commands. Continue from preceding successful speculative changes. Extract validation results before intentionally rolling back the outer transaction; intentional rollback is not reported as command failure.
5. Never run aggregate guards in the speculative transaction. Validation does not reserve state or guarantee later authoritative success.
6. An AAVR business rejection becomes a durable command outcome, delivered through normal reconciliation so its pending command and optimistic changes can settle. Persist that outcome outside the rolled-back validation transaction, through the existing ordered command-history ownership, rather than creating a second authoritative outcome log.
7. Preserve command identity, duplicate detection, ordering, failure version provenance, and normal retry behavior when carrying a validated admission decision into durable history. Once an occurrence's decision is retained, retries recover that decision instead of revalidating it into a different result.
8. Infrastructure failure during validation or outcome persistence remains retryable. Never acknowledge a durable business outcome until its durable record exists. No cross-repo atomic transaction is implied by speculative validation.

### Authoritative execution

1. Process admitted commands in order. A retained admission rejection records failure without applying command mutations.
2. For an admitted command that passed AAVR validation, rerun its program against actual execution state after preceding successful commands. Do not blindly commit speculative mutation descriptions.
3. Run aggregate guards against current state and apply that command's resulting mutations atomically. Per-command savepoints isolate mutation changes; checks and writes observe the same authoritative transaction.
4. A business rejection rolls back the command's changes, retains its terminal failure, and allows subsequent commands to execute. Recognized mutation-level domain failures remain individual command failures. Infrastructure failures abort/retry the execution transaction.
5. If speculative cart creation passed but authoritative creation fails, the following add-item program observes the absent cart and can fail independently. Unrelated commands remain eligible to succeed.
6. Contract and actor guard decisions are enforced at their designated admission contexts, not duplicated as aggregate guards. Rerunning the program may still produce a ContractError from actual state; its speculative success is not a guarantee.

### Cutover and documentation

1. Hard-cut superseded guard overrides, plain local-error construction, and raw-error envelope paths. Update in-scope callers, examples, schemas, tests, glossary, and architecture documentation together. No compatibility aliases, fallback decoders, or dual execution paths.
2. Preserve contract-version failure codec/adaptation responsibilities and command provenance. New JSON boundaries do not justify removing existing version-aware business-failure delivery.
3. Changed fixed storage schemas require empty storage. Implementation must document that requirement without resetting user storage automatically or translating deprecated rows.
4. This design supersedes conflicting plain-error and guard-override decisions in the earlier error and guard specs. Existing implementation records remain historical evidence, not constraints on the new design.

## Testing Decisions

1. Use existing authoring typecheck seams to verify composition, undeclared failure rejection, wrong declaration scope/extra rejection, and ContractError-only business failures from programs. Verify the framework error base cannot bypass these constraints and direct yield retains the full subclass type. Positively verify that aggregates accept declared failure members without an implementation; exhaustive coverage is deferred.
2. Extend the existing error and envelope round-trip seams to prove local Error identity/yieldability and JSON boundary behavior. Include diagnostic cause and nested Error values in adversarial inputs; assert no stack or diagnostic cause is exposed, while declared code/scope/extra survives schema encoding.
3. Test standalone methods at the session/AAVR seams: success and domain failure, missing selected rows, authentication checks, whole-replica checks, and explicit infrastructure failure. Verify authoritative guards are never invoked and repeated calls leave rows, cursors, journals, and outboxes unchanged.
4. Exercise the existing authoritative execution integration seam with dependent and unrelated commands. Cover speculative create-then-use success, complete speculative rollback on success/failure/interruption, authoritative rejection of the creation, dependent failure, and later unrelated success.
5. Verify durable AAVR rejections reconcile optimism, survive retries, and retain stable identity/provenance. Inject interruptions around validation and persistence to show no premature acknowledgement or contradictory duplicate outcome.
6. Verify authoritative sufficient-funds checks and debit occur atomically, with per-command rollback and continued execution after business failure. Infrastructure failure must not be retained as an ordinary refusal.
7. Prior art includes actor-contract typechecks, makeMutations tests, settleResult/readResult tests, executionGuards tests, and selected-reconciliation workerd tests. Use focused Nx targets for changed packages and affected consumers; widen verification only when dependency changes require it.

## Out of Scope

1. Predictive AggregateError checks, reservations, or guarantees that preflight success implies commit success.
2. A new cross-repository transaction protocol, compensation framework, or separate canonical rejection log.
3. Automatic reconstruction of yieldable errors in getApi, automatic UI subscriptions, or a list of outstanding checks on validation results.
4. Storage reset, compatibility migration, or unrelated repository refactoring.

## Further Notes

1. This is the design spec, not an implementation-completion record. A subsequent implementation plan must resolve the exact authoring API and durable admission handoff against the current source without changing the settled semantics above.
2. Existing authoritative execution already uses per-command savepoints for mutation application. The new requirement is ordered program reevaluation and scope-specific enforcement, not introducing savepoints for the first time.
