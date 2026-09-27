# Scoped command validation and yieldable errors — implementation plan

**Date:** 2026-09-22  
**Status:** Archived at the maintainer’s request on 2026-09-23; implementation present, acceptance verification deferred.  
**Source:** [Spec 005](./005-spec-scoped-command-validation-and-yieldable-errors.md)

## Archive checkpoint — 2026-09-23

1. The current source now includes native yieldable errors and explicit RPC encoding, inline failure records and owner guards, session/server validators, selected-snapshot scratch databases, always-rollback prefix validation, retained admission failures, and authoritative guard execution inside mutation savepoints. The earlier partial-implementation checkpoints below are historical.
2. Failure adaptation requirements are superseded by [Plan 007](./007-plan-failure-recognition.md). Exhaustive aggregate failure implementation coverage remains explicitly deferred.
3. Archived at the maintainer's request with acceptance verification outstanding. This source review did not rerun tests, typechecks, builds, or browser journeys. Remaining acceptance work is recorded in [TODOS.md](../../../TODOS.md#plans-005006007--deferred-acceptance-verification).

This checkpoint supersedes earlier instructions to keep the plan active until verification passes. Historical implementation and verification notes below are retained as recorded.

## 1. Outcome and implementation order

1. Restore locally yieldable errors and explicitly serialized API failures.
2. Add scoped error codecs and compositional guard declarations with declared-error and scope checks. Exhaustive aggregate failure coverage is deferred.
3. Separate guard evaluation from state-independent mutation construction; expose standalone validators.
4. Add always-rollback speculative validation with real actor-snapshot isolation.
5. Retain AAVR admission failures in existing ordered command history.
6. Run aggregate guards and mutation application together in ordered authoritative savepoints.
7. Migrate affected callers and documentation and complete type/runtime checks. Do not archive this plan until implementation and verification finish.

The snippets below specify intended interfaces and algorithms. Names introduced here are planned additions. Domain names such as `withdraw`, `account`, and `shopper` illustrate usage. Snippets that omit surrounding generic constraints, imports, provisioning, or bookkeeping are explicitly called out; they are not claims of currently compiling implementations.

## 2. Verified starting points

1. `packages/error/src/makeZerospinError.ts` returns a plain object. `IZerospinError` has code, message, status, cause, and nullable-record extra fields. Its codec has no runtime/JSON split.
2. Installed Effect exposes `Cause.YieldableError` with a `this`-typed iterator. Use its public `Data.Error` base; do not hand-code an iterator or import internal Effect modules.
3. `settleResult` and logger `makeRpcEnvelope` currently pass failure values through unchanged. `getApi` exposes envelope failures plus locally constructed API failures. All three require boundary changes.
4. `makeMutations` validates payload/authentication, runs an optional contract guard, and evaluates a synchronous program into mutation descriptions. Programs do not apply those descriptions themselves.
5. Aggregate actor and aggregate definitions currently provide guard services through layers; matching aggregate services override actor defaults. The new guard composition must replace that override mechanism.
6. AAVR stores resource tables for the aggregate replica. `readSelectedResources` and `getGraph` already compute actor-selected resource rows. Passing its ordinary Drizzle query service to a contract guard would expose more than the snapshot.
7. AggregateChain owns ordered input occurrences and duplicate receipts. AAVR does not currently own a separate admission log. Preserve this ownership.
8. Authoritative `executeCommandsTx` already uses `withSavepoint` for individual mutation application. Programs are prepared outside that savepoint today. `makeTx` and `withSavepoint` widen failures to `IAnyError`; correct their signatures where precise failures are needed.

## 3. Runtime errors and JSON errors

1. Keep `IZerospinError<CODE>` to one parameter. Make the concrete base class extend Effect's yieldable error implementation. Preserve current default values and helpers while changing their return value to a real instance. A minimal class shape is:

```ts
import { Data } from 'effect';

type ErrorExtra = Readonly<Record<string, unknown>> | null;

class ZerospinError<CODE extends string = string> extends Data.Error<{
  readonly _tag: 'ZerospinError';
  readonly code: CODE;
  readonly message: string;
  readonly status: number | null;
  readonly cause: string | null;
  readonly extra: ErrorExtra;
}> {
  constructor(props: {
    code: CODE;
    message?: string;
    status?: number | null;
    cause?: string | null;
    extra?: ErrorExtra;
  }) {
    super({
      _tag: 'ZerospinError',
      code: props.code,
      message: props.message ?? props.code,
      status: props.status ?? null,
      cause: props.cause ?? null,
      extra: props.extra ?? null,
    });
  }
}

type IZerospinError<CODE extends string = string> = ZerospinError<CODE>;
```

2. Add three subclasses. Do not add scope/extra generics to the base. Each subclass fixes its scope, so callers cannot construct a ContractError with an authoritative scope. Repeat this shape for actor and aggregate:

```ts
class ContractError<
  CODE extends string,
  EXTRA extends ErrorExtra,
> extends ZerospinError<CODE> {
  readonly scope = 'contract' as const;
  declare readonly extra: EXTRA;

  constructor(props: {
    code: CODE;
    extra: EXTRA;
    message?: string;
    status?: number | null;
    cause?: string | null;
  }) {
    super(props);
  }
}

// Same construction pattern:
// ActorError<CODE, EXTRA>: scope = 'actor'
// AggregateError<CODE, EXTRA>: scope = 'aggregate'
```

3. Lock yield inference before changing consumers. Neither an explicit base-class return annotation nor a transaction wrapper may silently erase this subtype:

```ts
const denied = new ContractError({
  code: 'account-not-owned',
  extra: { accountId: 'acct_1' },
});

const check = Effect.gen(function* () {
  return yield* denied;
});

// Compile-time expectations:
// Effect.Error<typeof check> = typeof denied
// error.code = 'account-not-owned'
// error.scope = 'contract'
// error.extra.accountId = string
// Runtime: denied instanceof Error === true
```

4. Keep the JSON base type; infer each scoped business error's wire type directly from its codec. Do not introduce a separate generic scoped-JSON alias. JSON extra is the schema's encoded type, which can differ from the runtime extra type. Do not model the wire type as `Omit<Error, 'stack'>`.

```ts
type IZerospinErrorJson<CODE extends string = string> = Readonly<{
  _tag: 'ZerospinError';
  code: CODE;
  message: string;
  status: number | null;
  extra: Readonly<Record<string, JsonValue>> | null;
}>;

// For a business codec:
// type WithdrawalFailureJson = typeof WithdrawalFailure.Encoded;
// This includes each member's literal scope and schema-encoded extra.
```

5. Select wire fields explicitly. Encode business extra through its declared codec first. For framework extra, recursively accept JSON primitives, arrays, and plain records; reject cycles, Error instances, functions, undefined, and unsupported values. Drop diagnostic `stack` and `cause` properties from framework-extra records. Do not spread arbitrary errors, copy their prototypes, or call native Error serialization. Contract schema authors must not place diagnostic traces in public message/extra fields; a serializer cannot recognize arbitrary diagnostic text disguised as an ordinary string.

```ts
// Algorithm fragment; encodeExtra is the already-selected boundary codec.
const json = {
  _tag: 'ZerospinError',
  code: error.code,
  message: error.message,
  status: error.status,
  extra: yield * encodeExtra(error.extra),
  // Include scope explicitly for a scoped business error.
};
// No stack, cause, constructor, iterator, or arbitrary own properties.
```

6. Implement a shared encoding procedure in the error package usable by core and logger without a dependency cycle. Scoped classes carry an explicit schema-backed `toJson` operation or equivalent encoder capability bound when decoding/constructing the declared business error. It must preserve the encoded extra type. A business instance without its declared codec is not allowed to use a generic record fallback. Core contract validation supplies/validates that codec; logger only invokes the shared encoding protocol.
7. Use a small fixed framework JSON error (`error-serialization-failed`, generic public message, null extra) if serialization fails while settling a typed error. Record the original diagnostic locally. Do not replace transport defects with a business refusal, and do not fail recursively while serializing the serialization error.

### 3.1 Contract codecs

1. Add `ContractError.schema`, `ActorError.schema`, and `AggregateError.schema` factories. Each accepts a literal code and an optional extra codec (default Schema.Null), constructs the literal-scope wire schema, and decodes to its yieldable subclass. Runtime diagnostic cause is null on decoding; remote causes are not reconstructed. Implement using the installed Effect Schema transform APIs.
2. This is the proposed authoring surface:

```ts
const withdrawV1 = makeContractVersion(withdraw, {
  // Existing version, models, payload, and authentication.
  failures: {
    accountNotOwned: ContractError.schema({
      code: 'account-not-owned',
      extra: Schema.Struct({ accountId: Schema.String }),
    }),
    accountClosed: ActorError.schema({
      code: 'account-closed',
      extra: Schema.Struct({ accountId: Schema.String }),
    }),
    insufficientFunds: AggregateError.schema({
      code: 'insufficient-funds',
      extra: Schema.Struct({
        accountId: Schema.String,
        required: Schema.Number,
        available: Schema.Number,
      }),
    }),
  },
});
// The framework derives a union codec from this inline record.
// A factory with omitted extra defaults to Schema.Null and permits .make().
```

3. Reject conflicting schema members with the same code within a contract version. Preserve failureUp/failureDown and historical provenance. Update business classification before any broad `isZerospinError` branch. A malformed scoped value is an invalid business failure, not automatically a framework error.
4. Retained business failures continue to use the existing command/version/encoded owner record. Store encoded JSON rather than runtime instances. Encode/decode adapters still run synchronously without arbitrary caller services. Explicit runtime decoding is available for execution; public delivery emits encoded JSON without manufacturing a yieldable client object.

### 3.2 Envelope boundaries

1. Replace `settleResult` with `encodeRpcOutcome` and `readResult` with `decodeRpcOutcome`, and update logger `makeRpcEnvelope` to serialize typed runtime failures. An outcome means either success or failure; retain the existing Success/Failure envelope shape. Keep success handling, telemetry collection, and rejected transport promises distinct. Already encoded retained business delivery must use its typed JSON path rather than an untyped pass-through overload.
2. Introduce a conditional `ErrorJson<E>` projection for the encoding protocol. Preserve distribution across unions and scoped extra's encoded type.

```ts
// Intended signatures, omitting encoder-protocol constraints for readability.
function encodeRpcOutcome<A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<IResult<A, ErrorJson<E>>, never, R>;

function makeRpcEnvelope<A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<IRpcEnvelope<A, ErrorJson<E>>, never, R>;

// decodeRpcOutcome propagates the JSON it receives; no implicit reconstruction.
function decodeRpcOutcome<A, EJson>(
  result: IResult<A, EJson>,
): Effect.Effect<A, EJson | IZerospinErrorJson<'result-invalid'>>;
```

3. In getApi, encode its local async/selection/response failures too. All failures exposed by the returned API have JSON types. Validate received envelope/error structure at the boundary; do not cast wire values to runtime classes.

```ts
yield * api.withdraw({ accountId, amount });
// Effect<Success, WithdrawalFailureJson | ApiFailureJson>
// Normal Effect failure propagation still works.
// A received JSON error itself is intentionally not yieldable.
```

4. Audit failure values nested in successful command/snapshot/reconciliation payloads as well as top-level Failure envelopes. Changing only `encodeRpcOutcome` would leave an alternate raw-error path. Keep diagnostics in internal telemetry; external envelopes continue to expose trace links, not telemetry batches.

## 4. Guard authoring and failure constraints

1. Use direct callbacks, not descriptor arrays. Keep ordinary layers for dependencies. Type callback inputs from the bound models, payload, and authentication, and constrain business failures to the declared union for the owning scope. The declaration site fixes the error category and execution context; there is no callback scope selector or separate failure schema.

| Declaration                                | Allowed business failure          | Execution context                                                                                        |
| ------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Contract `guard`                           | ContractError, scope `contract`   | Session database; actor-selected snapshot on AAVR                                                        |
| Contract `program`                         | ContractError, scope `contract`   | State-independent mutation construction from payload, authentication, and models; no database capability |
| Actor `guards[commandName]`                | ActorError, scope `actor`         | Whole replica database on AAVR                                                                           |
| Aggregate `guards[actorName][commandName]` | AggregateError, scope `aggregate` | AVR transaction, atomically with mutations                                                               |

2. Preserve the contract's singular `guard` property. Actor guards are command-keyed callbacks without another actor-name nesting. Aggregate guards are actor-keyed, then command-keyed callbacks. Factory-provided `queryDb` is a read-only query capability for the context above; payload and authentication are inferred from the bound contract and owner.

```ts
const withdrawV1 = makeContractVersion(withdraw, {
  version: '1.0.0',
  payload: withdrawalPayload,
  authentication: withdrawalAuthentication,
  failures: {
    accountNotOwned: ContractError.schema({
      code: 'account-not-owned',
      extra: Schema.Struct({ accountId: Schema.String }),
    }),
    accountClosed: ActorError.schema({
      code: 'account-closed',
      extra: Schema.Struct({ accountId: Schema.String }),
    }),
    insufficientFunds: AggregateError.schema({
      code: 'insufficient-funds',
      extra: Schema.Struct({
        accountId: Schema.String,
        required: Schema.Number,
        available: Schema.Number,
      }),
    }),
  },
  guard: Effect.fn('withdraw.guard')(function* ({
    queryDb,
    payload,
    authentication,
    failures,
  }) {
    if (!ownsAccount(queryDb, payload.accountId, authentication)) {
      yield* failures.accountNotOwned.make({
        extra: { accountId: payload.accountId },
      });
    }
  }),
  program: makeWithdrawalMutations,
});

const shopperV1 = makeAggregateActorVersion(shopper, {
  // Existing db, authentication, selections, version, etc.
  contracts: { withdraw: withdrawV1 },
  guards: {
    withdraw: Effect.fn('withdraw.ownerGuard')(function* ({
      queryDb,
      payload,
      authentication,
      failures,
    }) {
      // queryDb queries the whole AAVR replica here.
      if (isAccountClosed(queryDb, payload.accountId, authentication)) {
        yield* failures.accountClosed.make({
          extra: { accountId: payload.accountId },
        });
      }
    }),
  },
});

const accountsV1 = makeAggregateVersion(accounts, {
  // Existing models, execution, version, etc.
  actors: { shopper: shopperV1 },
  guards: {
    shopper: {
      withdraw: Effect.fn('withdraw.ownerGuard')(function* ({
        queryDb,
        payload,
        authentication,
        failures,
      }) {
        // queryDb queries current AVR state inside the mutation transaction.
        const available = readBalance(
          queryDb,
          payload.accountId,
          authentication,
        );
        if (available < payload.amount) {
          yield* failures.insufficientFunds.make({
            extra: {
              accountId: payload.accountId,
              required: payload.amount,
              available,
            },
          });
        }
      }),
    },
  },
});
```

3. Reject undeclared business failures and wrong-category failures where their callback is supplied. Programs can emit only declared ContractError business failures. Framework execution errors remain separate; their broad base type must not bypass scoped business-failure constraints.
4. Composition means retaining all owner callbacks; an aggregate callback never replaces the actor or contract callback. Select callbacks by ownership, not by inspecting their runtime output. Run the contract guard and actor guard before the program during AAVR validation. Run only the aggregate guard before applying prepared mutations during authoritative execution. Do not run aggregate guards predictively.

```ts
const contractGuard = contract.guard;
const actorGuard = actor.guards[commandName];
const aggregateGuard = aggregate.guards[actorName]?.[commandName];

// Session: contractGuard + program
// AAVR:   contractGuard(snapshot) + actorGuard(full replica) + program(inputs)
// AVR:    aggregateGuard(authoritative tx) + applyMutations(authoritative tx)
```

5. Validate emitted business failures against the contract's declared failure schema and the callback owner's scope, including the extra shape. Reject undeclared codes, wrong scopes, and incompatible extra values. Do not let the broad framework error base structurally admit arbitrary scoped business errors.
6. **Deferred as of 2026-09-23:** Do not check that every declared failure has an implementation, including at aggregate construction. A declared failure may have no guard or program that emits it. Omitted programs and empty guards are valid. Do not require inferred callback error subsets solely to establish exhaustive coverage.
7. Preserve typed callback inputs, declared failure constraints, requirements, and runtime/JSON error types through upgrades, registries, session bindings, and exported declarations. This change removes only the exhaustive implementation check; it does not relax declaration scope or failure-schema validation.
8. Remove superseded guard-version service replacement behavior in affected callers. Reusable checks remain ordinary precisely inferred functions invoked directly from owner callbacks. Update named guard factories, initialization, session bindings, and requirement inference together. Do not add descriptor arrays, a replicaGuards property, or an alternate override path.

## 5. Standalone validation and snapshot isolation

1. Add standalone core functions and corresponding authenticated AAVR endpoints. Reuse the session's binding/authentication and existing command payload inference. A UI call need not allocate a persisted command ID, push index, or occurrence.

```ts
const result =
  yield *
  validateSessionCommand({
    session,
    contractName: 'withdraw',
    payload: { accountId, amount },
  });
// IResult<void, ContractFailureJson | FrameworkFailureJson>
const disabled = result._tag === 'Failure';

// Server operations resolve authentication from the bound capability.
yield * validateActorCommand({ binding, commandInput });
// validateActorCommand runs the contract guard on the selected snapshot
// and the actor guard on the whole AAVR replica.
// validateAggregateCommand is an internal AVR transaction helper, not preflight.
```

2. validateSessionCommand runs the contract guard against session data, then the state-independent program. validateActorCommand runs the contract guard on the selected snapshot, actor guard on the whole AAVR replica, then the state-independent program. Both discard mutation descriptions in standalone mode. Failure means first applicable business failure or explicit framework error, not a list of unfinished checks. validateAggregateCommand is an internal AVR transaction helper for the aggregate guard; never expose it as a standalone predictive endpoint. Its success has meaning only within the commit transaction.
3. Use the existing synchronous program runner, payload validation, and authentication schema decoding. Extract guard evaluation from makeMutations rather than invoking stageCommand and undoing its journal afterward. A standalone success is not authorization for a later push.
4. On AAVR, select rows using readSelectedResources/getGraph against the current speculative full database. Load exactly those rows into a disposable SQLite database with the actor's model schema and relations, then pass its read-only query capability only to the contract guard. Nested relational queries must see only selected rows. An unselected foreign-key target must behave as absent, as it does in a partial browser replica.
5. Provision the scratch database before opening the synchronous validation transaction. Reuse the existing in-memory SQLite/Drizzle facilities and add a workerd-compatible bundled module factory where needed. The current Node/browser helper is not evidence that dynamic WASM initialization works in workerd: verify this seam first. Use an explicitly scoped resource with deterministic close/finalization; do not create another persistent repo or modify the live replica to hide rows.
6. Refresh scratch rows per command from the full speculative state so earlier successful mutations and changed selection membership are visible. Use raw scratch loading with foreign-key enforcement disabled for the partial graph; scratch is read-only to user code. Mutation application occurs in the full speculative transaction, where normal relational checks remain enabled.

```ts
// Algorithm fragment; scratch is already provisioned and synchronously usable.
const selected =
  yield *
  readSelectedResources({
    db: speculativeTx,
    models,
    selections: actor.selections,
    authentication,
  });

replaceScratchResources(scratch, selected);
const mutations =
  yield *
  evaluateContractCommand({
    command,
    queryDb: scratch,
    authentication,
    guard: contract.guard,
  });
// Do not provide speculativeTx as the contract snapshot query capability.
```

7. Standalone validation must not advance stateful ID/time services used by real staging. Programs receive the same command inputs and deterministic execution services as execution. If a program requires an occurrence ID, supply an ephemeral validation-local occurrence context; never reserve a live session ID/counter or create a hidden stage. Test this explicitly alongside row/cursor immutability.

## 6. Always-rollback speculative transactions

1. Extend makeTx with an explicit `rollback: 'always'` option, preserving its existing default commit behavior. Reuse its synchronous runner, nested-root-transaction prohibition, and suspended-fiber cancellation. Do not introduce a second transaction implementation that omits those guarantees.
2. Inside the database callback, capture a successful value and throw a private, per-invocation sentinel to force rollback. Catch that exact sentinel only after the database wrapper has rolled back successfully. A rollback/database error is a real failure, not validation success. Exit failures continue through the existing failure path.

```ts
// Algorithm for the new makeTx option; implemented inside existing machinery.
const rollbackSuccess = {};
let captured: { value: A } | undefined;

try {
  db.transaction(tx => {
    const exit = runSynchronouslyWithTx(tx, program);
    if (Exit.isFailure(exit)) throw exit;
    captured = { value: exit.value };
    throw rollbackSuccess;
  });
} catch (cause) {
  if (cause === rollbackSuccess && captured !== undefined) {
    return captured.value;
  }
  throw cause;
}
```

3. Preserve exact authored failure types in withSavepoint and the relevant transaction wrappers, adding precise wrapper-error unions instead of returning only IAnyError. Infrastructure classification must survive nested helpers.
4. In the outer rollback transaction, run each command in its own savepoint. Contract guards, actor guards, program evaluation, and mutation application all precede marking that speculative command successful. No commands table, outbox, projection cursor, hash, or broadcast is updated.

```ts
// Control-flow sketch; classify before treating failure as a business result.
const results = [];
for (const command of commands) {
  const attempt =
    yield *
    withSavepoint({
      tx,
      program: ({ tx: commandTx }) =>
        Effect.gen(function* () {
          const actorContext = yield* selectActorSnapshot(commandTx, command);
          yield* runContractGuard(actorContext, command);
          yield* runActorGuard(commandTx, command);
          const mutations = yield* makeMutations(commandInputs);
          yield* applySpeculativeMutations(commandTx, mutations);
        }),
    }).pipe(Effect.result);

  if (Result.isFailure(attempt) && !isBusinessRejection(attempt.failure)) {
    return yield * Effect.fail(attempt.failure);
  }
  results.push(yield * encodeValidationResult(command, attempt));
}
return results; // Outer transaction deliberately rolls back even on success.
```

5. Never run the aggregate guard or emit AggregateError during this process. Capture all replica/service inputs required for synchronous speculative application before entering the transaction. No fetch, alarm scheduling, telemetry persistence, or outbound RPC occurs inside it.
6. Existing pushes can arrive as separate single-command messages. A one-command-only dry run would lose create-then-use dependencies. Before validation, obtain the already admitted prefix after AAVR's captured aggregateIndex, and overlay it speculatively before new commands. Exclude retained rejections and duplicate new IDs. Use ordered command inputs and retained decisions from AggregateChain; do not invent a second pending queue. Acquire remote inputs outside SQL transactions, then verify the local checkpoint still matches; retry preparation if local catch-up changed it.
7. Intervening concurrent admission can make a preview stale; this is permitted by the agreed non-authoritative semantics. Its outcome is not a reservation. The final authoritative guard and mutation application determine execution success. Do not add a distributed lock to make previews globally serializable.

## 7. Durable admission handoff

1. Keep client command input unchanged. Add a server-only validated-admission argument between admission orchestration and AggregateChain. Session APIs cannot supply or forge its verdict. Resolve/verify authentication before validation.
2. Add nullable `admissionFailure` to the chain's existing command row and chained-command delivery shape. It contains the existing retained business-failure representation with contract/version provenance. Null means admitted without a business refusal. This is decision metadata on the existing occurrence, not another command copy or outcome log.

```ts
// Internal server handoff; not accepted from browser command payloads.
type ValidatedAdmission = Readonly<{
  command: EncodedAggregateCommand;
  admissionFailure: RetainedBusinessFailure | null;
}>;

// Existing commands row gains one field:
// admissionFailure: RetainedBusinessFailure | null
// Existing command fields and aggregateIndex remain the sole occurrence.
```

3. AggregateChain checks duplicate command input before validation where possible and again transactionally before insertion. On an identical retained occurrence, return its original receipt/decision, ignoring a newly computed verdict. Different input with the same ID remains a conflict. Do not incorporate a retry's recomputed verdict into command-input identity.

```ts
const existing = readOccurrence(tx, submitted.command.id);
if (existing !== undefined) {
  assertSameCommandInput(existing, submitted.command);
  return receiptFor(existing); // First retained admission decision wins.
}
insertOccurrence(tx, {
  ...encodeCommandFields(submitted.command),
  aggregateIndex: nextIndex,
  admissionFailure: submitted.admissionFailure,
});
```

4. Persist the ordered batch atomically in the existing admission transaction after speculative validation has rolled back. A crash before insertion leaves nothing acknowledged and can revalidate on retry. A crash after insertion recovers the original receipt. Never hold AAVR's rollback transaction open while calling AggregateChain.
5. The version materializer turns a retained admission failure into the normal failed terminal occurrence without running its program or applying its mutations. Adapt the retained failure through the existing contract lineage for delivery; keep the original provenance immutable. Reconciliation and selection delivery remain responsible for settling pending session optimism.
6. Update all chain entrypoints, including server-originated aggregate commands, to use the applicable validation path. Keep capability checks for those callers. Service commands retain their existing independent execution model; the aggregate validation change must not create an unauthenticated bypass through a direct chain method.
7. Include retained admissionFailure in the typed chained-command schema used by every consuming version. Flat rows remain the canonical storage; no stored canonical-byte column or duplicate command envelope is introduced. Changed fixed schemas require empty storage, documented without resetting it.

## 8. Ordered authoritative execution

1. Keep state-independent program evaluation and remote resource/service preparation outside the transaction. Prepare mutations from the admitted command inputs and capture required immutable replica resources using existing resource-version pins. Never use a preview's speculative writes as authoritative state. No database query capability is supplied to programs, directly or through execution services.
2. For each admitted command, short-circuit retained admission failure into normal terminal history. Otherwise evaluate aggregate guards against the transaction state left by preceding successful commands and apply prepared mutations in the same savepoint.
3. Programs are independent of database state. They do not receive queryDb and do not rerun to observe preceding writes. Ordered dependency checks belong to aggregate guards and mutation application. Do not rerun contract or actor admission guards. A program failure is still classified by its declared ContractError schema, while aggregate guards emit only AggregateError.

```ts
for (const command of orderedCommands) {
  if (command.admissionFailure !== null) {
    yield * retainTerminalFailure(tx, command, command.admissionFailure);
    continue;
  }

  const result =
    yield *
    withSavepoint({
      tx,
      program: ({ tx: commandTx }) =>
        Effect.gen(function* () {
          yield* validateAggregateCommand({ tx: commandTx, command });
          const mutations = prepared.mutations;
          yield* installRequiredReplicas(
            commandTx,
            mutations,
            preparedResources,
          );
          return yield* applyAuthoritativeMutations(commandTx, mutations);
        }),
    }).pipe(Effect.result);

  if (Result.isFailure(result) && !isBusinessRejection(result.failure)) {
    return yield * Effect.fail(result.failure);
  }
  yield * retainTerminalOutcome(tx, command, result);
}
```

4. Capture before-images for prepared mutations against the current ordered transaction state and compute deltas only from successful application. Failed savepoints contribute no resource delta. Terminal row, disposition hash, and cursor changes remain in the outer transaction.
5. Preserve the existing explicit mutation-domain-failure classification (missing row, referential integrity, deleted service resource). These framework codes remain distinct from declared contract business failures. Unrecognized framework failures, defects, and interruption abort/retry; they are not ordinary rejections.
6. Because guards and writes share the authoritative transaction, the sufficient-funds check protects the debit. The next command sees the earlier successful debit, or the original balance if it failed and rolled back.

## 9. Tests and acceptance examples

1. Use the existing authoring typecheck files. Add negative assertions for undeclared failures, wrong scope, wrong extra, a mixed-scope guard, and ActorError or AggregateError from a program. Verify that the broad framework error base cannot bypass these constraints. Add positive checks for guard composition, precise yield inference, and accepting declared failures with no implementation. Use existing Equals assertions rather than inventing assertion utilities.

```ts
// Valid: exhaustive implementation coverage is deferred.
makeAggregateVersion(identity, missingFundsGuard);

// @ts-expect-error ContractError cannot satisfy aggregate scope.
makeAggregateVersion(identity, wrongScopeGuard);

// @ts-expect-error Missing required available amount in extra.
InsufficientFunds.make({ extra: { accountId, required: 70 } });
```

2. Test native Error identity and direct yield failure. Encode a runtime error containing a diagnostic stack, cause, and extra properties through both encodeRpcOutcome and makeRpcEnvelope. Assert JSON includes only allowed fields, preserves the declared encoded extra, and is not an Error. Test getApi's local transport-failure path as well as a received server failure.

```ts
expect(runtimeError).toBeInstanceOf(Error);
expect(yieldedFailure).toBe(runtimeError);
expect(jsonError).not.toBeInstanceOf(Error);
expect(jsonError).not.toHaveProperty('stack');
expect(jsonError).not.toHaveProperty('cause');
expect(jsonError.scope).toBe('aggregate');
expect(jsonError.extra).toEqual({ accountId, required: 70, available: 20 });
```

3. Prove actor isolation using selected account A and unselected account B. Direct and nested queries must show B absent to contract guards on the selected snapshot and present to actor checks on the whole AAVR replica. Verify changing selection membership after a speculative mutation refreshes the next actor snapshot.
4. Test speculative validation on Node and workerd, not only a mock connection. Capture all resource rows, command rows, checkpoint values, and event counters before/after. Successful dry run, business rejection, defect, and interrupted/suspending execution must leave them unchanged. Check scratch cleanup and no mutation notifications.

```ts
const before = capturePersistentState();
const results = yield * validateBatch([createCartCommand, addItemCommand]);
expect(results.map(r => r._tag)).toEqual(['Success', 'Success']);
expect(capturePersistentState()).toEqual(before);
expect(publishedEvents).toEqual([]);
```

5. Test sequential pushes as well as a single batch: the second request must overlay the first pending admitted input. Test duplicate retries with a changed replica so the first retained decision wins. Test process interruption before retention, after retention, and before receipt delivery.
6. Exercise authoritative dependency failure and unrelated continuation at the existing workerd execution/reconciliation seam:

```text
Admission preview: create cart ✓, add item ✓, rename profile ✓
Authoritative:     create cart ✗, add item ✗, rename profile ✓
Resource result:   no cart, no item, renamed profile
History:           three ordered terminal outcomes, no partial cart writes
```

7. Test two withdrawals against a balance of 100, each for 70: authoritative execution must permit at most one successful debit and retain the other's declared insufficient-funds outcome. No authoritative guard invocation occurs in either browser or AAVR preview.
8. Verify local and remote JSON business failure adaptation through historical contract versions, including extra whose runtime and encoded shapes differ. Verify infrastructure failures never become durable admission rejections.
9. Inspect resolved Nx projects/targets before running checks. Expected packages are `@zerospin/error`, `@zerospin/logger`, `@zerospin/core`, and `system-worker`; query actual configuration and affected example consumers. Run focused typechecks, error/envelope tests, transaction tests, and worker integration tests, then build affected public declarations and check consumers. Do not disable dependency execution or call guessed target flags.

```sh
pnpm nx show project @zerospin/error --json
pnpm nx show project @zerospin/logger --json
pnpm nx show project @zerospin/core --json
pnpm nx show project system-worker --json
# Use the resolved targets and supported test-file filtering from those outputs.
```

## 10. Migration, documentation, and completion gates

1. Hard-cut runtime errors, JSON errors, codecs, result/envelope types, guard authoring, declared-error and scope checks, and their callers together. Update examples that currently use plain tagged business failures. Keep relevant explanatory comments but rewrite obsolete override/plain-object claims.
2. Update glossary guard/execution-service definitions, architecture workflows for push/admission/execution, the error package's usage examples, and local plain-error guidance. Mark earlier specs' incompatible statements superseded by spec/plan 005 without rewriting their historical implementation records.
3. Document empty-storage requirements for changed fixed schemas. Do not automatically reset storage, write migration translators, add compatibility aliases, or retain duplicate old/new guard paths.
4. The workerd scratch-database runtime is an early proof gate. Verify callback input typing and declared-error/scope constraints before migrating production callers. Exhaustive aggregate failure coverage is deferred and is not a proof gate. A failure is not permission to expose the full replica to contract checks or relax error constraints.
5. Completion requires all acceptance cases above, no direct raw Error envelope paths, no execution of authoritative checks during previews, and no use of speculative writes as authoritative state. Record actual commands/results when implemented. This plan contains no claim that those checks have run.

## 11. Implementation checkpoint — 2026-09-22

Implemented and retained:

- `makeTx(name, Db, { rollback: 'always' })` returns the successful program result only after rollback. A per-invocation sentinel distinguishes deliberate rollback from database failure. Default transactions still commit.
- `makeTx` and `withSavepoint` preserve precise authored failures and add their literal wrapper-error types. Defects, interruption, and suspension remain infrastructure failures. Savepoints now cancel suspended fibers before rollback, matching the root transaction behavior.
- `AggregateChain.admitCommandsTx` maps its narrowed transaction failure through `Effect.mapError`, preserving the existing conflict/admission-error behavior.
- `system-worker/src/validation/makeActorSnapshotDb.ts` acquires a disposable sql.js database using bundled, precompiled workerd WASM, provisions its schema, disables foreign keys for partial graphs, exposes a query capability, and closes the connection with its Effect scope. It is not yet wired into AAVR validation.
- Node/workerd tests cover speculative sibling visibility, failed-savepoint isolation, outer successful rollback, typed failure, defect, interruption, suspension, and cancellation of late savepoint writes. A Node regression checks that a database-reported rollback failure cannot become validation success. A workerd test proves direct/nested query isolation, manually refreshed snapshot contents, and connection cleanup.

Historical proof attempt — exhaustive coverage deferred on 2026-09-23:

The attempted aggregate coverage signature did not preserve inference for the planned inline `Effect.fn(function* ({ db, authentication }) { ... })` guard shape. Without the coverage constraint, the callback retained its exact failure type. Adding the aggregate completeness constraint caused the guard generic to resolve to its empty/broad default before the contextual callback result was inferred; a valid aggregate was then rejected as missing its aggregate failure implementation. A callback without contextual parameters passed one attempted signature. Moving the check into a conditional rest parameter and reverse-mapped callback returns did not resolve the inline case. These experiments are not evidence that the intended API is impossible; the exhaustive-coverage tests were unsatisfied at that checkpoint. The 2026-09-23 decision removes those tests from the current acceptance criteria.

The incomplete error-codec and owner-authoring changes were removed rather than leaving a partial runtime cutover or weakening coverage. Resume with the callback authoring surface, including inline contextual parameters, declared-error/scope constraints, and upgrade/registry preservation. Do not reinstate exhaustive coverage checking as a prerequisite. Then implement the runtime/JSON error cutover, guard composition, standalone validators, selected-snapshot loading, speculative pending-prefix overlay, durable admission decisions, ordered authoritative reevaluation, caller migration, and remaining acceptance tests. Existing runtime errors and envelope helpers are unchanged. No storage schema was changed or reset. This plan must remain open.

Verification commands and results:

- `pnpm nx run-many -t ts -p @zerospin/core,system-worker` — passed, including dependency declaration builds.
- `pnpm nx run @zerospin/core:test -- src/drizzle/makeTx.node.spec.ts src/drizzle/withSavepoint.node.spec.ts src/drizzle/speculativeTx.node.spec.ts` — passed, 15 tests.
- `pnpm nx run system-worker:test:workerd -- src/validation/` — passed, 7 tests on workerd.
- `pnpm nx run system-worker:test -- src/AggregateChain/admitCommands/admitCommands.node.spec.ts` — passed, 8 tests.
- `pnpm nx run system-worker:ts` — passed after preserving the scratch factory's exact Drizzle relation generic.
- `pnpm exec tsc -p packages/system-worker/tsconfig.inMemorySessionGuard.json --noEmit` — passed. This existing dedicated proof configuration now includes the new scratch tests; the regular worker test typecheck excludes workerd test files.
- `git diff --check` — passed. The pre-existing guidance/spec edits were preserved.

The passing checks above cover only the retained foundations: 30 focused runtime tests plus the specified typechecks. They do not establish the full acceptance criteria in section 9.

## 12. Scope revision — 2026-09-23

The maintainer deferred the exhaustive aggregate check that every declared business failure has an implementation. Keep the contract's declared failure schema and each declaration owner's allowed scope. Guards still compose and emitted errors still require valid code/scope/extra, but aggregate construction accepts unimplemented members of the declared union. This removes the earlier coverage-inference blocker from the implementation requirements. No runtime check needed removal: the attempted authoring implementation had already been reverted.

## 13. Implementation checkpoint — 2026-09-23

This continuation is **not a completed implementation of the plan**.

Retained additions in `packages/error`:

- `ScopedError.ts` implements the native, yieldable `ZerospinError` class and the three fixed-scope subclasses. Their schema factories validate runtime extra, bind a typed `toJson` encoder, decode wire values to native instances with null diagnostic cause, and preserve schema-encoded extra types.
- `encodeError.ts` implements explicit field selection, the conditional `ErrorJson<E>` projection, framework-extra JSON validation with nested diagnostic removal, and a fixed serialization failure with local diagnostic logging. Unbound business instances cannot use framework-extra encoding.
- The new tests cover native identity, direct yield inference, fixed code/scope, transformed extra, invalid scopes/codes/extra, cycles, sparse arrays, unsupported values, diagnostic removal, and an unbound business instance.

The RPC follow-up wired the shared encoder into `encodeRpcOutcome` and logger `makeRpcEnvelope`, renamed the corresponding reader to `decodeRpcOutcome`, and let `executeAggregateCommand` infer its result. These are implemented boundaries. `makeZerospinError` still returns plain objects; owner guards, standalone validation, durable admission decisions, and authoritative reevaluation remain unfinished. No storage migration was added.

The attempted integrated cutover reached a passing core declaration build and an inline authoring proof with explicit authentication, but did not finish the production migration. The worker declaration build still reported 112 runtime/JSON boundary type errors. A contract guard using inferred default authentication also exposed an unresolved contextual-typing case. Those incomplete production edits were reverted, preserving the transaction/scratch work and pre-existing guidance edits. A diagnostic copy of the attempted diff is at `/tmp/zerospin-plan005-incomplete-cutover.patch`; it is not implementation and is not required for continuation.

Remaining work is still sections 3–10 beyond these error-package foundations: finish and verify actual declaration-site inference (including omitted authentication), preserve guard requirements through upgrades/registries, perform the complete runtime/JSON boundary cutover, migrate callers, compose and execute owner guards, add standalone validation, wire snapshot isolation and pending-prefix speculation, retain admission decisions, run authoritative guards and writes inside savepoints, and complete the acceptance tests. Do not archive this plan.

Verification for the retained additions:

- `pnpm nx run-many -t ts,test -p @zerospin/error` — passed, including the error declaration build; 4 test files and 23 tests.
- `pnpm nx run-many -t ts -p @zerospin/core,system-worker` — passed after restoring the incomplete cutover, including dependency declaration builds.
- `pnpm nx run-many -t ts,test,lint -p @zerospin/error` — passed after formatting and lint corrections; 23 tests, no lint errors or warnings.
- Scoped `pnpm exec oxfmt` and `git diff --check` — passed.

## 14. Continuation verification — 2026-09-23

- `pnpm nx run-many -t ts -p @zerospin/core,system-worker` — passed after the command rename, including dependency declaration builds. Nx Cloud reported an access warning; local targets succeeded.
- The checkout was clean at the start of this continuation. The historical failed cutover above is not the current RPC implementation.

## 15. Settled scope correction — guard-only database access

The maintainer confirmed that programs are independent of database state. Only guards receive `queryDb`: selected/session state for contract guards, whole AAVR state for actor guards, and the authoritative savepoint for aggregate guards. `makeMutations` must not accept a database or run guards. Programs remain mutation constructors; do not provide a database through their execution services. Prepared mutation descriptions may be used authoritatively because they depend on command inputs, while guards and mutation application observe ordered state inside the savepoint. This supersedes the earlier state-dependent program reevaluation requirement and is an implementation instruction, not an open design question.

## 16. One Shopping caller migration — 2026-09-23

Migrated only `createPaymentIntent` and its UI/test callers:

- The payload now carries `expected.status` and `expected.cancellationRequested`. The shared `checkPaymentIntent` domain check verifies these against current rows, along with ownership, promotion commitment, and payability.
- The program reads only the payload: an expected processing purchase produces no mutations; an unpaid purchase starts payment, clears its previous failure, and uses the existing deterministic payment-intent ID. Failed unpaid payments remain retryable at their original price.
- The V2 aggregate guard (inherited by V3) calls the shared domain check directly and maps its business refusal to `shopping-state-changed`. It does not invoke contract or actor guard machinery.
- A fresh request carrying stale unpaid state is rejected after the purchase moves to processing. Retrying the same retained command occurrence remains the framework's responsibility; this change does not verify that separate acceptance gate.

Verification: `pnpm nx run shopping:test -- run tests/unit/checkout.spec.ts` passed all 5 tests, including processing no-op preservation, stale-state authoritative refusal, unpaid retry, ownership, and promotion/payability checks. `pnpm nx run shopping:ts` passed. `pnpm nx run shopping:lint` passed with 22 existing warnings outside the changed behavior. Changed code blocks were formatted and `git diff --check` passed.

The broader remaining caller migrations, guard migration, standalone-validator coverage, acceptance tests, JSON boundary audit, and final plan-wide verification remain open. This checkpoint is not a fresh audit of those workstreams.

## 17. Named Shopping guard entry points — 2026-09-23

1. All 57 Shopping contract, actor, and aggregate guard declarations now use named `Effect.fn` callbacks, including delegating callbacks. Shared domain and capability checks also have named entry points. The proposed `makeGuard` helper is not implemented in this change.
2. Aggregate authoring types now prevent guard callbacks from supplying model/actor inference. Existing declarations remain the inference source; guard failure-scope checks remain in place. A typecheck regression covers named guard callbacks on an aggregate upgrade. Delegating aggregate callbacks derive their input annotations from the shared check functions.
3. Verification: `pnpm nx run-many -t ts -p @zerospin/core,shopping` passed; `pnpm nx run shopping:test -- run tests/unit/checkout.spec.ts` passed all 5 tests; `pnpm nx run shopping:lint` passed with 20 remaining pre-existing warnings. The 57 declarations were audited for named `Effect.fn` entry points, changed guard blocks were formatted, and `git diff --check` passed. No other plan work was undertaken.

## 18. Schema-inferred reusable guards — 2026-09-23

1. Implemented `makeGuard({ models, payload, authentication, program })` in core and exported it from both SDK entry points. Payload and authentication use ordinary Effect schemas. The named `Effect.fn` program receives inferred `{ db, payload, authentication }`; `db` exposes only queries for the declared models. The returned function accepts decoded inputs and performs no extra decoding or guard dispatch.
2. Migrated Shopping's shared `checkPaymentIntent` and `checkPurchase` to this helper. Each declaration remains a named `Effect.fn` and explicitly passes its `queryDb` as `db`. Purchase checks receive version-normalized cart items in their own schema-defined payload. Payment admission and authoritative checks still reuse the same function, with the existing aggregate failure mapping.
3. Type proofs cover model-query and decoded-schema inference, query-only access, exact error/service types, and rejection of undeclared or wrong-scope failures at the owning declaration. A runtime test covers decoded inputs, database identity, service provision, and preserved failure identity. The SDK export inventory now includes `makeGuard` and the already-exported `ZerospinError`/`encodeError` that were missing from that test.
4. Verification passed: `pnpm nx run-many -t ts -p @zerospin/core,shopping`; the focused core `makeGuard.node.spec.ts` test (1 test); Shopping's `checkout.spec.ts` (5 tests); `pnpm nx run @zerospin/sdk:test` (7 tests). New helper files pass scoped lint and formatting checks; Shopping lint passes with 20 existing warnings. `git diff --check` passes. Broader plan acceptance gates remain open.

## 19. Explicit authored model lists — 2026-09-23

1. Recorded the local convention in `wiki/patterns/models/explicit-models-at-use-site.ts`: declare each model explicitly at its authored use site; do not share standalone model-map variables or spread another model list. Applied it across Shopping declarations and the affected repository fixtures, including actor databases and sessions. Removed `commonModels`, `purchaseGuardModels`, and `cartGuardModels`.
2. Snapshot-ownership tests retain explicit models inside complete authored options and still mutate the original options to prove copying. Runtime processing of arbitrary model registries remains framework behavior, not an authored dependency list.
3. The source audit found no remaining model-map aliases or spreads in the covered authored declaration APIs across examples, packages, and e2e. Focused checks passed: 52 core tests, 5 Shopping checkout tests, 9 worker session-lock tests, and 1 DevTools session test. Scoped lint reported no errors and 10 existing warnings; formatting and `git diff --check` passed.
4. The combined core/Shopping/worker/DevTools typecheck reported errors in the concurrently changing `serverActors.node.spec.ts` and the `serverActors` type proofs. These files were not changed for this model-list work; the run did not report errors in the affected model-list files. A follow-up Shopping typecheck was blocked in the concurrently added `ServerActorExecutionRepo.ts` dependency build. This is not a claim of a clean repository-wide typecheck.

## 20. Explicit failure declarations — 2026-09-23

1. Removed `withStateFailure`, `CheckoutFailure`, and `CartFailure`. All 21 affected Shopping failure declarations now list individual error schemas directly in an inline `Schema.Union`, including `StateChanged`. Nested unions were flattened without changing their members or order.
2. Removed redundant failure forwarding from authoring fixtures that declare no business failures. Those fixtures continue to omit `failure`; no new empty-failure codec was introduced. Recorded explicit failure declarations in the local pattern index.
3. Verification passed: 13 focused core guard/error-codec tests, 5 Shopping checkout tests, scoped formatting, and `git diff --check`. Scoped lint reported no errors and 4 existing warnings. The authored failure-property audit found no remaining helper calls, shared Shopping union aliases, or forwarded `.failure` declarations. Core typechecking remains blocked by the concurrent `serverActors.*` changes; this work does not claim a clean full typecheck.

## 21. Inline primitive declarations — 2026-09-23

1. Recorded the rule in `wiki/patterns/typescript/inline-primitives.ts`: primitive descriptors are declared inline, never assigned to variables. Shared Effect schemas remain reusable; their primitive wrappers are inline.
2. Removed primitive variables from Shopping checkout, replica construction, and affected schema/core/Zod fixtures. Snapshot and malformed-reference tests access descriptors through authored shapes to preserve mutation and identity checks.
3. The source audit found no remaining direct primitive-factory variable declarations across examples, packages, and e2e. All four affected typechecks passed (schema, Zod, core, Shopping), as did 118 focused tests. Scoped lint reported no errors and one existing import-order warning. Changed source files were formatted and scoped `git diff --check` passed. Broader plan acceptance gates remain open.

## 22. Inline failure records and injected constructors — 2026-09-23

1. Replaced authored `failure` codecs with `failures` records. Every entry uses a camelCase key and declares its scoped error schema inline. Removed standalone error constants and authored unions; record keys do not change wire codes. The source audit covered 60 inline authoring records with no aliases or spreads. The only remaining singular authored declaration is an intentional rejection test.
2. Contracts retain a snapshotted record and derive one internal union codec. Contract programs and contract/actor/aggregate guards receive the record; failure adapters receive destination constructors. `makeGuard` declares and injects its own record while preserving decoded inputs and service inference. Shared Shopping domain/capability helpers receive constructors through arguments. Individual failure values, retained envelopes, and failureUp/failureDown remain singular.
3. ContractError.schema, ActorError.schema, and AggregateError.schema default omitted extra to Schema.Null. Default-null errors support .make(), .make({}), and overrides without extra, and produce explicit extra: null. Custom extras retain required decoded types. Encoded field requirements remain strict.
4. Inherited contract declarations reuse their record and codec; explicitly redeclared records still require adapters when crossing changed failure declarations. Added tests for record injection, snapshot identity, duplicate codes, invalid entries, camelCase keys, legacy declaration rejection, null defaults, strict wire fields, and inheritance/redeclaration behavior. Updated affected callers, type proofs, local guidance, and the error README.
5. Verification: all six affected Nx typechecks passed (error, core, logger, Shopping, system-worker, Tic-tac-toe). Focused tests passed: 16 error tests, 42 core tests, 10 logger tests, 5 Shopping checkout tests, 6 Tic-tac-toe tests, and 14 worker tests (93 total). Scoped lint has no errors; formatting and scoped git diff --check pass.
6. The wider worker execution run is not green: three tests in executionGuards.node.spec.ts still fail. Two aggregate cases report repo-key-encode-failed; the aggregate committed-prefix case reports SchemaError: Expected string. Its failure declarations were migrated, but these admission/row-fixture failures remain unresolved. This checkpoint does not claim those acceptance gates or broader plan 005 work are complete.

## 23. One contract version per file — 2026-09-23

1. Split 17 existing Shopping and Tic-tac-toe contract versions into individual named files. Upgrades import their preceding version; shared checks and schemas have separate modules. Remaining checkout/promotion registry modules only assemble imported bindings. Expanded the promotion-transition and game-move factories into concrete version declarations.
2. Recorded the convention in `wiki/patterns/contracts/one-contract-version-per-file.ts`. Concurrent, newly authored `checkout/workflowContracts.ts` remains outside this split and still needs the convention applied by its owning work.
3. Verification passed: Shopping and Tic-tac-toe Nx typechecks; 7 Shopping checkout/confirmation tests and 6 Tic-tac-toe tests; affected-file formatting and diff checks. Scoped lint retains one existing Tic-tac-toe SDK-import restriction error and two warnings (unused authentication and global location). Broader plan acceptance gates remain open.
