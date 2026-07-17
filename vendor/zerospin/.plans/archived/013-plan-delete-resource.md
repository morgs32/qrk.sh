# deleteResource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `delete` mutation operation — an owner-only hard delete that removes the live resource row everywhere and releases the AccountRepo replica registration, propagated through the existing command/block chains.

**Architecture:** The block pipeline is mutation-agnostic: contract programs emit mutations, `applyMutationTx` applies them authoritatively, `encodeAppliedMutation`/`decodeAppliedMutation` carry them in blocks, and every downstream repo replays them through `commitAppliedMutationTx`. Adding `'delete'` to the operation vocabulary and each of those switch statements propagates deletion end-to-end for free — selections already emit `deleted` deltas for rows that vanish (`getDeletedRefs` is a presence diff). The only new system-worker behavior is in `handleServiceBlocks`: applying a registered service delete also removes the `replicatedResources` registration row, which is the v1 "release" decision. Delete is a tombstone, not an erasure — finalized blocks are immutable archives and are never rewritten.

**Tech Stack:** TypeScript (ESM, `.ts` imports), Effect (`Effect.fn`, `Schema`), drizzle-orm over SQLite (sql.js / wasm / Durable Objects), vitest + `@effect/vitest` (`it.effect`, `it.layer`), Nx + pnpm monorepo.

## Global Constraints

- Operation name is the string literal `'delete'`; the builder is `deleteMutation` in `packages/core/src/contracts/deleteMutation.ts` (mirrors `archiveMutation`).
- Inverse of delete is the existing `IInverseOperation` variant `Readonly<{ resource: InferResource<IModel> }>` (same one `replicateResource` uses). Rollback = upsert the prior row. Do NOT add a new inverse variant.
- Authoritative apply (`applyMutationTx`): deleting a missing row fails with the existing `mutation-row-not-found` error from `getResourceRow` — consistent with archive/update/move. Do not special-case it.
- Replica replay (`commitAppliedMutationTx`): delete is a bare SQL `DELETE`; replaying against an already-missing row is a silent no-op. Never throw for a missing row on the replay path.
- Ownership requires **zero new code**: `assertMutationsUseModels` (`packages/core/src/contracts/assertMutationsUseModels.ts:43-62`) already rejects any non-`replicateResource` mutation whose model ownership doesn't match the command owner, and the type-level `AssertMutationModelInModels` does the same at compile time. Do not modify either.
- Registration release happens ONLY in `handleServiceBlocks` (service-owned delete). There is still no account-initiated release API — do not add one.
- Delete never rewrites block history. Blocks already published to Account/Actor/Service/Frontend block repos are immutable.
- Match existing style exactly: `Effect.fn('name')` wrappers, kebab-case `ZerospinError` codes, `mapParseError` with `code` + `prefix`, `.ts` extension in relative imports, `@zerospin/core/<path>` subpath imports across packages (a `./*` wildcard export exists in core's package.json — no package.json changes needed).
- Run tasks through Nx with pnpm: `pnpm nx test @zerospin/core`, `pnpm nx run @zerospin/core:ts`, `pnpm nx test system-worker`, `pnpm nx run system-worker:test:workerd`, `pnpm nx run system-worker:ts`.
- Commit after every task with the message given in that task. End each commit message with the trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `deleteMutation` builder

**Files:**
- Create: `packages/core/src/contracts/deleteMutation.ts`
- Test: `packages/core/src/contracts/deleteMutation.node.spec.ts`

**Interfaces:**
- Consumes: `IModel`, `InferIdFromAbbreviation` from `../models/types.ts`; `List` fixture from `../fixtures/system.ts`.
- Produces: `type IDeleteMutation<MODEL extends IModel>` and `deleteMutation({ model, resourceId })` returning `Effect<IDeleteMutation<MODEL>, IAnyError>`. Task 2 adds `IDeleteMutation` to the `IMutation` union; Tasks 4–5 call `deleteMutation` from contract programs.

This task is standalone-green: nothing references the new type yet, so typecheck stays clean before Task 2.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/contracts/deleteMutation.node.spec.ts`:

```typescript
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { List } from '../fixtures/system.ts';

import { deleteMutation } from './deleteMutation.ts';

describe('deleteMutation', () => {
  it.effect('returns raw delete mutation', () =>
    Effect.gen(function* () {
      const mutation = yield* deleteMutation({
        model: List,
        resourceId: 'lst_test' as const,
      });

      expect(mutation.model).toBe(List);
      expect(mutation.operationName).toBe('delete');
      expect('executedAt' in mutation).toBe(false);
      expect(mutation.operation).toEqual({});
    }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test @zerospin/core -- src/contracts/deleteMutation.node.spec.ts`
Expected: FAIL — cannot resolve `./deleteMutation.ts` (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/contracts/deleteMutation.ts` (mirror of `archiveMutation.ts`):

```typescript
import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IModel, InferIdFromAbbreviation } from '../models/types.ts';

export type IDeleteMutation<MODEL extends IModel> = {
  readonly model: MODEL;
  readonly operationName: 'delete';
  readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly operation: Record<string, never>;
};

export const deleteMutation = Effect.fn('deleteMutation')(function* <
  MODEL extends IModel,
>(props: {
  model: MODEL;
  resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
}): Effect.fn.Return<IDeleteMutation<MODEL>, IAnyError> {
  const { model, resourceId } = props;
  yield* Effect.void;

  return {
    model,
    operationName: 'delete',
    resourceId,
    operation: {},
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test @zerospin/core -- src/contracts/deleteMutation.node.spec.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm nx run @zerospin/core:ts`
Expected: exit 0.

```bash
git add packages/core/src/contracts/deleteMutation.ts packages/core/src/contracts/deleteMutation.node.spec.ts
git commit -m "feat(core): add deleteMutation builder"
```

---

### Task 2: `delete` across the core mutation pipeline

**Files:**
- Modify: `packages/core/src/contracts/types.ts:20-49` (import + `IOperationName` + `IMutation` union)
- Modify: `packages/core/src/contracts/applyMutationTx.ts:47-173` (new switch case)
- Modify: `packages/core/src/contracts/applyMutationInverseTx.ts:26-170` (new switch case)
- Modify: `packages/core/src/contracts/encodeAppliedMutation.ts` (schema literal at line 18-24; `makeOperationJsonSchema` line 43-69; `makeInverseOperationJsonSchema` line 87-117; both encode switches)
- Modify: `packages/core/src/contracts/decodeAppliedMutation.ts:53-201` (new switch case)
- Modify: `packages/core/src/contracts/commitAppliedMutationTx.ts:39-147` (new switch case)
- Test (modify): `packages/core/src/contracts/applyMutationTx.node.spec.ts`
- Test (create): `packages/core/src/contracts/commitAppliedMutationTx.node.spec.ts`

**Interfaces:**
- Consumes: `IDeleteMutation` / `deleteMutation` from Task 1.
- Produces: `'delete'` as a member of `IOperationName`; every pipeline stage (apply, inverse, encode, decode, replica commit) handles it. Tasks 3–5 rely on `deleteMutation` being accepted by `applyMutationTx`, `applyFrontendMutationTx` (which delegates all non-replicate ops to `applyMutationTx` — needs no edit), `applyAccountMutationTx` (same delegation — needs no edit), and `commitAppliedMutationTx`.

**This task is one commit by necessity:** every switch has an exhaustive `default: const _exhaustive: never = operationName` guard, so adding `'delete'` to the union breaks typecheck in all five files simultaneously. Write the tests first (they fail at runtime with `unsupported-mutation-operation` because vitest transpiles without typechecking), then implement all cases, then verify typecheck.

- [ ] **Step 1: Write the failing apply/inverse tests**

In `packages/core/src/contracts/applyMutationTx.node.spec.ts`, add to the imports block:

```typescript
import { deleteMutation } from './deleteMutation.ts';
```

Append these two tests inside `describe('applyMutationTx + applyMutationInverseTx', () => { ... })`, after the existing tests (reuse the file's existing `testUserId`, `testActorId`, `now`, `appliedAt` constants):

```typescript
  it.effect('delete removes the row and its inverse restores it', () =>
    Effect.gen(function* () {
      const schema = makeResourceDrizzleSchemas(mainModels);
      const relations = makeDrizzleRelationsFromModels(mainModels);
      const dbConfig = makeDbConfig({ schema, relations });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

      db.insert(User.drizzleSchema)
        .values({
          id: testUserId,
          modelName: User.modelName,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          version: User.version,
          actorId: testActorId,
          name: 'Alice',
        })
        .run();

      const mutation = yield* deleteMutation({
        model: User,
        resourceId: testUserId,
      });

      const applied = yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.applyDelete.transaction')(
          function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation,
              commandId: 'cmd_pushedinv001',
              mutationIndex: 0,
              appliedAt,
            });
          },
        ),
      });

      const deletedRow = db
        .select()
        .from(User.drizzleSchema)
        .where(eq(User.drizzleSchema.id, testUserId))
        .get();
      expect(deletedRow).toBeUndefined();
      expect(applied.lastAppliedAt).toEqual(now);
      expect(applied.inverseOperation).toEqual({
        resource: expect.objectContaining({
          id: testUserId,
          name: 'Alice',
        }),
      });

      yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.inverseDelete.transaction')(
          function* ({ tx }) {
            return yield* applyMutationInverseTx({ tx, mutation: applied });
          },
        ),
      });

      const restoredRow = db
        .select()
        .from(User.drizzleSchema)
        .where(eq(User.drizzleSchema.id, testUserId))
        .get();
      expect(restoredRow).toEqual(
        expect.objectContaining({
          id: testUserId,
          name: 'Alice',
        }),
      );
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('delete fails when the row is missing', () =>
    Effect.gen(function* () {
      const schema = makeResourceDrizzleSchemas(mainModels);
      const relations = makeDrizzleRelationsFromModels(mainModels);
      const dbConfig = makeDbConfig({ schema, relations });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });

      const mutation = yield* deleteMutation({
        model: User,
        resourceId: testUserId,
      });

      const failure = yield* makeTx({
        db,
        program: Effect.fn('applyMutationTxSpec.deleteMissing.transaction')(
          function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation,
              commandId: 'cmd_pushedinv001',
              mutationIndex: 0,
              appliedAt,
            });
          },
        ),
      }).pipe(Effect.flip);

      expect(failure).toMatchObject({ code: 'mutation-row-not-found' });
    }).pipe(Effect.provide(AsyncLive)),
  );
```

- [ ] **Step 2: Write the failing encode→decode→commit→replay spec**

Create `packages/core/src/contracts/commitAppliedMutationTx.node.spec.ts`:

```typescript
import { it } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeDrizzleRelationsFromModels } from '../drizzle/makeDrizzleRelations.ts';
import { makeResourceDrizzleSchemas } from '../drizzle/makeDrizzleSchemas.ts';
import { makeMigratedInMemorySqljsDb } from '../drizzle/makeMigratedInMemorySqljsDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import { mainModels, User } from '../fixtures/system.ts';

import { applyMutationTx } from './applyMutationTx.ts';
import { commitAppliedMutationTx } from './commitAppliedMutationTx.ts';
import { decodeAppliedMutation } from './decodeAppliedMutation.ts';
import { deleteMutation } from './deleteMutation.ts';
import { encodeAppliedMutation } from './encodeAppliedMutation.ts';

const testUserId = 'usr_commitdel001' as const;
const testActorId = 'actr_commitdel001' as const;
const now = new Date('2020-01-01T00:00:00.000Z');
const appliedAt = new Date('2020-01-02T00:00:00.000Z');

const userRow = {
  id: testUserId,
  modelName: User.modelName,
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  version: User.version,
  actorId: testActorId,
  name: 'Alice',
};

describe('commitAppliedMutationTx delete', () => {
  it.effect('encoded delete round-trips and removes the replica row', () =>
    Effect.gen(function* () {
      const schema = makeResourceDrizzleSchemas(mainModels);
      const relations = makeDrizzleRelationsFromModels(mainModels);
      const dbConfig = makeDbConfig({ schema, relations });
      const authorDb = yield* makeMigratedInMemorySqljsDb({ dbConfig });
      const replicaDb = yield* makeMigratedInMemorySqljsDb({ dbConfig });
      authorDb.insert(User.drizzleSchema).values(userRow).run();
      replicaDb.insert(User.drizzleSchema).values(userRow).run();

      const mutation = yield* deleteMutation({
        model: User,
        resourceId: testUserId,
      });
      const applied = yield* makeTx({
        db: authorDb,
        program: Effect.fn('commitDeleteSpec.apply.transaction')(
          function* ({ tx }) {
            return yield* applyMutationTx({
              tx,
              mutation,
              commandId: 'cmd_commitdel001',
              mutationIndex: 0,
              appliedAt,
            });
          },
        ),
      });

      const encoded = yield* encodeAppliedMutation({ mutation: applied });
      expect(encoded.operationName).toBe('delete');
      expect(encoded.operation).toBe('{}');

      const decoded = yield* decodeAppliedMutation({
        mutation: encoded,
        model: User,
      });
      expect(decoded.operationName).toBe('delete');
      expect(decoded.inverseOperation).toEqual({
        resource: expect.objectContaining({
          id: testUserId,
          name: 'Alice',
        }),
      });

      const committed = yield* makeTx({
        db: replicaDb,
        program: Effect.fn('commitDeleteSpec.commit.transaction')(
          function* ({ tx }) {
            return yield* commitAppliedMutationTx({
              tx,
              models: mainModels,
              mutation: encoded,
            });
          },
        ),
      });
      expect(committed).toBeNull();

      const replicaRow = replicaDb
        .select()
        .from(User.drizzleSchema)
        .where(eq(User.drizzleSchema.id, testUserId))
        .get();
      expect(replicaRow).toBeUndefined();

      const replayed = yield* makeTx({
        db: replicaDb,
        program: Effect.fn('commitDeleteSpec.replay.transaction')(
          function* ({ tx }) {
            return yield* commitAppliedMutationTx({
              tx,
              models: mainModels,
              mutation: encoded,
            });
          },
        ),
      });
      expect(replayed).toBeNull();
    }).pipe(Effect.provide(AsyncLive)),
  );
});
```

Note the second `commitAppliedMutationTx` call replays the same delete against the already-empty replica — this is the no-op idempotence guarantee.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm nx test @zerospin/core -- src/contracts/applyMutationTx.node.spec.ts src/contracts/commitAppliedMutationTx.node.spec.ts`
Expected: FAIL — the new tests error with `unsupported-mutation-operation` (switches hit their exhaustive default at runtime).

- [ ] **Step 4: Add `'delete'` to the vocabulary in `types.ts`**

In `packages/core/src/contracts/types.ts`, add the import (alphabetical, after `createMutation`):

```typescript
import type { IDeleteMutation } from './deleteMutation.ts';
```

Change `IOperationName`:

```typescript
export type IOperationName =
  | 'archive'
  | 'create'
  | 'delete'
  | 'move'
  | 'replicateResource'
  | 'update';
```

Add `IDeleteMutation<MODEL>` to the `IMutation` union:

```typescript
export type IMutation<
  MODEL extends IModel = IModel,
  OPERATION_NAME extends IOperationName = IOperationName,
> = Extract<
  | ICreateMutation<MODEL>
  | IUpdateMutation<MODEL>
  | IArchiveMutation<MODEL>
  | IDeleteMutation<MODEL>
  | IMoveMutation<MODEL>
  | IReplicateResourceMutation<MODEL>,
  { operationName: OPERATION_NAME }
>;
```

`IInverseOperation` needs no change — the `Readonly<{ resource: InferResource<IModel> }>` variant already exists.

- [ ] **Step 5: Implement the `applyMutationTx` case**

In `packages/core/src/contracts/applyMutationTx.ts`, add after `case 'archive'` (before `case 'create'`):

```typescript
    case 'delete': {
      const resourceRow = yield* getResourceRow({
        tx,
        model,
        operationName,
        resourceId,
      });
      const resource = yield* Schema.validate(model.resourceSchema)(
        resourceRow,
      ).pipe(
        mapParseError({
          code: 'delete-resource-row-invalid',
          prefix: `Failed to validate deleted resource "${resourceId}"`,
        }),
      );
      inverseOperation = { resource };
      lastAppliedAt = resourceRow.updatedAt;

      tx.delete(table).where(eq(table.id, resourceId)).run();
      break;
    }
```

`Schema.validate(model.resourceSchema)(row)` is exactly how `applyFrontendMutationTx.ts:40-47` captures the prior full row for the replicateResource inverse — same shape, same `{ resource }` variant.

- [ ] **Step 6: Implement the `applyMutationInverseTx` case**

In `packages/core/src/contracts/applyMutationInverseTx.ts`, add after `case 'archive'` (before `case 'move'`):

```typescript
      case 'delete': {
        if (mutation.inverseOperation === null) {
          return yield* new ZerospinError({
            code: 'mutation-inverse-required',
            message:
              'applyMutationInverseTx: delete mutations require inverseOperation',
          });
        }
        if (!('resource' in mutation.inverseOperation)) {
          return yield* new ZerospinError({
            code: 'invalid-inverse-operation',
            message:
              'applyMutationInverseTx: delete inverseOperation must include resource',
          });
        }
        upsertHelper({
          table,
          tx,
          values: mutation.inverseOperation.resource,
        });
        return;
      }
```

- [ ] **Step 7: Implement encode support**

In `packages/core/src/contracts/encodeAppliedMutation.ts`, four edits:

1. `EncodedAppliedMutationSchema` literal (line 18-24):

```typescript
  operationName: Schema.Literal(
    'archive',
    'create',
    'delete',
    'move',
    'replicateResource',
    'update',
  ),
```

2. `makeOperationJsonSchema` — add to its inner switch (after `case 'archive'`):

```typescript
      case 'delete':
        return Schema.Struct({});
```

3. `makeInverseOperationJsonSchema` — add to its inner switch (after `case 'create'`):

```typescript
      case 'delete':
        return Schema.NullOr(
          Schema.Struct({
            resource: model.resourceSchema,
          }),
        );
```

4. In `encodeAppliedMutation` itself, add to the **operation** switch (after `case 'archive'`):

```typescript
        case 'delete':
          return {
            ...encodedBase,
            operation: yield* Schema.encode(
              makeOperationJsonSchema({ model, operationName: 'delete' }),
            )({}).pipe(
              mapParseError({
                code: 'failed-to-encode-applied-mutation-operation',
                prefix: `Failed to encode mutation operation JSON for model "${model.modelName}"`,
              }),
            ),
          };
```

and to the **inverse** switch (after `case 'replicateResource'`, before `case 'create'`):

```typescript
      case 'delete':
        if (!('resource' in inverseOperation)) {
          return yield* new ZerospinError({
            code: 'invalid-inverse-operation',
            message:
              'encodeAppliedMutation: delete inverseOperation must include resource',
          });
        }
        return {
          ...encoded,
          inverseOperation: yield* Schema.encode(
            makeInverseOperationJsonSchema({
              model,
              operationName: 'delete',
            }),
          )(inverseOperation).pipe(
            mapParseError({
              code: 'failed-to-encode-applied-mutation-inverse-operation',
              prefix: `Failed to encode delete inverse for model "${model.modelName}"`,
            }),
          ),
        };
```

- [ ] **Step 8: Implement the `decodeAppliedMutation` case**

In `packages/core/src/contracts/decodeAppliedMutation.ts`, add after `case 'archive'` (before `case 'create'`):

```typescript
      case 'delete': {
        const inverseOperation = (yield* Schema.decode(
          makeInverseOperationJsonSchema({
            model,
            operationName: 'delete',
          }),
        )(mutation.inverseOperation).pipe(
          mapParseError({
            code: 'failed-to-decode-applied-mutation-inverse-operation',
            prefix: `Failed to decode mutation inverseOperation for model "${mutation.modelName}"`,
          }),
        )) as IInverseOperation | null;
        return {
          model,
          resourceId,
          operationName: 'delete',
          operation: {},
          ...appliedFields,
          inverseOperation,
        };
      }
```

- [ ] **Step 9: Implement the `commitAppliedMutationTx` case**

In `packages/core/src/contracts/commitAppliedMutationTx.ts`, add after `case 'create'` (before `case 'move'`):

```typescript
      case 'delete': {
        tx.delete(table).where(eq(table.id, mutation.resourceId)).run();
        break;
      }
```

The trailing row re-select already returns `null` when the row is gone, which is what callers (`handleActorBlocks.ts:115-126`, `getUpdatedResources.ts:39-48`) expect for a removed resource.

- [ ] **Step 10: Run tests and typecheck**

Run: `pnpm nx test @zerospin/core -- src/contracts/applyMutationTx.node.spec.ts src/contracts/commitAppliedMutationTx.node.spec.ts`
Expected: PASS (all tests, including the pre-existing ones).

Run: `pnpm nx run @zerospin/core:ts`
Expected: exit 0 — proves every exhaustive switch now covers `'delete'`.

Run the full core suite to catch fallout: `pnpm nx test @zerospin/core`
Expected: PASS. If a snapshot test fails purely because the operation vocabulary grew (e.g. a JSON-schema or command snapshot), inspect the diff; if it is only the added `'delete'` literal, regenerate with `pnpm nx test @zerospin/core -- -u` and re-review.

- [ ] **Step 11: Commit**

```bash
git add packages/core/src/contracts/
git commit -m "feat(core): apply, encode, and replay delete mutations"
```

---

### Task 3: system-worker accepts `delete` in block schemas

**Files:**
- Modify: `packages/system-worker/src/AccountBlockRepo/accountBlockDrizzleSchemas.ts:110-112`

**Interfaces:**
- Consumes: `IOperationName` (now including `'delete'`) via the `assert<Equals<InferDecodedRow<typeof mutationShape>, IEncodedAppliedMutation>>()` guard directly below the shape.
- Produces: system-worker compiles again after Task 2; Task 4 can persist delete mutations in account blocks.

- [ ] **Step 1: Run typecheck to verify it fails**

Run: `pnpm nx run system-worker:ts`
Expected: FAIL — the `Equals<InferDecodedRow<typeof mutationShape>, IEncodedAppliedMutation>` assertion no longer holds because `IOperationName` gained `'delete'` but the drizzle enum did not.

- [ ] **Step 2: Add `'delete'` to the enum**

In `packages/system-worker/src/AccountBlockRepo/accountBlockDrizzleSchemas.ts`:

```typescript
  operationName: primitives.enum({
    values: ['archive', 'create', 'delete', 'move', 'replicateResource', 'update'],
  }),
```

- [ ] **Step 3: Verify typecheck and node tests pass**

Run: `pnpm nx run system-worker:ts`
Expected: exit 0.

Run: `pnpm nx test system-worker`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/system-worker/src/AccountBlockRepo/accountBlockDrizzleSchemas.ts
git commit -m "feat(system-worker): accept delete in account block mutation schema"
```

---

### Task 4: registration release on service delete + chain integration test

**Files:**
- Modify: `packages/system-worker/src/AccountRepo/handleServiceBlocks/handleServiceBlocks.ts:103-109`
- Modify: `packages/system-worker/src/fixtures/system.ts` (add `deleteProduct` contract; register it on `appService`)
- Test (modify): `packages/system-worker/src/FrontendRepo/FrontendRepo.workerd.spec.ts`

**Interfaces:**
- Consumes: `deleteMutation` from `@zerospin/core/contracts/deleteMutation`; `commitAppliedMutationTx` behavior from Task 2; existing `accountRepoDrizzleSchemas.replicatedResources` table (`packages/system-worker/src/AccountRepo/AccountRepo.ts:132-150`).
- Produces: applying a registered service `delete` mutation in AccountRepo also removes its `replicatedResources` row. Fixture contract `deleteProduct` (`payload: { id }`, service `'app'`) for this and future specs.

Why this is safe with respect to ordering: the relevance gate at `handleServiceBlocks.ts:97-102` runs **before** the commit, using the registration row that still exists; releasing the registration after the commit means every later service block that mentions the resource takes the existing `registration === undefined → continue` branch and still advances the watermark. Re-replication after delete fails cleanly because `prepareAccountCommands` fetches the canonical row from ServiceRepo, which no longer has one.

- [ ] **Step 1: Add the `deleteProduct` fixture contract**

In `packages/system-worker/src/fixtures/system.ts`:

Add to the imports (alongside the other mutation builder imports from `@zerospin/core/contracts/...`):

```typescript
import { deleteMutation } from '@zerospin/core/contracts/deleteMutation';
```

Add after the `archiveProduct` contract (line ~202):

```typescript
const deleteProduct = makeContract({
  commandName: 'deleteProduct',
  payload: {
    id: primitives.id({ model: Product }),
  },
  program: ({ payload }) =>
    Effect.all({
      deleted: deleteMutation({
        model: Product,
        resourceId: payload.id,
      }),
    }),
  version: '1.0.0',
});
```

Register it on the service controller (line ~328):

```typescript
  contracts: {
    archiveProduct,
    createProduct,
    deleteProduct,
    updateProduct,
  },
```

- [ ] **Step 2: Write the failing integration test**

In `packages/system-worker/src/FrontendRepo/FrontendRepo.workerd.spec.ts`, add a second `it.effect` inside the existing `it.layer(TestLayer)(it => { ... })` block, after the first test. It reuses the first test's exact idioms (`executeInRepo`, `makeAsync(...).pipe(Effect.flatMap(decodeRpc))`, drain sequence):

```typescript
    it.effect(
      'deletes a replicated service resource and releases its registration',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({ id: 'frontend-delete-resource' });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const productId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const actorKey = {
            systemVersion: system.version,
            accountId,
            accountName: main.accountName,
            actorName: main.actorName,
            actorId,
          };
          const frontendKey = {
            ...actorKey,
            frontendName: main.frontendName,
          };
          const accountRepoKey = {
            systemVersion: system.version,
            accountId,
            accountName: main.accountName,
          };

          const accountRepo = yield* getAccountRepo({ key: accountRepoKey });
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: accountRepoKey,
              fn: ({ db, schema }) => {
                const now = new Date(0);
                db.insert(schema.user)
                  .values({
                    id: userId,
                    actorId,
                    modelName: 'user',
                    name: 'Frontend delete user',
                    version: 1,
                    archivedAt: null,
                    createdAt: now,
                    updatedAt: now,
                  })
                  .run();
              },
            }),
          );
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorRepo,
              repo: ActorRepo,
              key: actorKey,
              fn: () => undefined,
            }),
          );
          const frontendRepo = yield* getFrontendRepo({ key: frontendKey });
          yield* makeAsync(() =>
            frontendRepo.getFrontendState({
              accountId,
              accountName: main.accountName,
              actorId,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'system-worker-test',
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const serviceRepo = yield* getServiceRepo({
            key: { systemVersion: system.version, serviceName: 'app' },
          });
          const createServiceCommand: IServiceCommand = {
            id: 'cmd_frontend_delete_create',
            commandName: 'createProduct',
            payload: {
              id: productId,
              name: 'Doomed service product',
            },
            version: '1.0.0',
            commandType: 'service',
            serviceName: 'app',
          };
          const createResult = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [createServiceCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(createResult.failedCommands).toEqual([]);
          yield* makeAsync(() => serviceRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );

          const seedTime = new Date(1);
          const replicateCommand = yield* makeAccountCommand({
            contracts: userAccount.contracts,
            contractName: 'replicateProduct',
            accountId,
            accountName: main.accountName,
            actorId,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemName: main.systemName,
            payload: {
              product: {
                id: productId,
                modelName: 'product',
                name: 'Stale client seed',
                version: 1,
                archivedAt: null,
                createdAt: seedTime,
                updatedAt: seedTime,
              },
            },
          });
          const replicateBlock = yield* makeAsync(() =>
            accountRepo.finalizeAccountBlock({
              accountId,
              accountName: main.accountName,
              commands: [replicateCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(replicateBlock.failedCommands).toEqual([]);

          const accountBlockRepo = yield* getAccountBlockRepo({
            key: accountRepoKey,
          });
          const actorBlockRepo = yield* getActorBlockRepo({ key: actorKey });
          const serviceBlockRepo = yield* getServiceBlockRepo({
            key: { systemVersion: system.version, serviceName: 'app' },
          });
          const drainChain = Effect.gen(function* () {
            yield* makeAsync(() =>
              serviceBlockRepo.drainAccountSubscribers(),
            ).pipe(Effect.flatMap(decodeRpc));
            yield* makeAsync(() => accountBlockRepo.drainActorOutbox()).pipe(
              Effect.flatMap(decodeRpc),
            );
            yield* makeAsync(() =>
              actorBlockRepo.drainFrontendSubscribers(),
            ).pipe(Effect.flatMap(decodeRpc));
            yield* makeAsync(() =>
              frontendRepo.drainFrontendBlockOutbox(),
            ).pipe(Effect.flatMap(decodeRpc));
          });
          yield* drainChain;

          const replicatedState = yield* makeAsync(() =>
            frontendRepo.getFrontendState({
              accountId,
              accountName: main.accountName,
              actorId,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'system-worker-test',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(
            replicatedState.resources.find(row => row.id === productId)?.name,
          ).toBe('Doomed service product');

          const deleteServiceCommand: IServiceCommand = {
            id: 'cmd_frontend_delete_delete',
            commandName: 'deleteProduct',
            payload: {
              id: productId,
            },
            version: '1.0.0',
            commandType: 'service',
            serviceName: 'app',
          };
          const deleteResult = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [deleteServiceCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(deleteResult.failedCommands).toEqual([]);
          yield* makeAsync(() => serviceRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* drainChain;

          const accountDeleteState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: accountRepoKey,
              fn: ({ db, schema }) => ({
                products: db.select().from(schema.product).all(),
                registrations: db
                  .select()
                  .from(schema.replicatedResources)
                  .all(),
                subscriptions: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .all(),
              }),
            }),
          );
          expect(accountDeleteState.products).toEqual([]);
          expect(accountDeleteState.registrations).toEqual([]);
          expect(accountDeleteState.subscriptions).toEqual([
            expect.objectContaining({
              serviceName: 'app',
              currentServiceIndex: 2,
            }),
          ]);

          const deletedState = yield* makeAsync(() =>
            frontendRepo.getFrontendState({
              accountId,
              accountName: main.accountName,
              actorId,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'system-worker-test',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(
            deletedState.resources.find(row => row.id === productId),
          ).toBeUndefined();

          const rereplicateCommand = yield* makeAccountCommand({
            contracts: userAccount.contracts,
            contractName: 'replicateProduct',
            accountId,
            accountName: main.accountName,
            actorId,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemName: main.systemName,
            payload: {
              product: {
                id: productId,
                modelName: 'product',
                name: 'Resurrection attempt',
                version: 1,
                archivedAt: null,
                createdAt: seedTime,
                updatedAt: seedTime,
              },
            },
          });
          const rereplicateBlock = yield* makeAsync(() =>
            accountRepo.finalizeAccountBlock({
              accountId,
              accountName: main.accountName,
              commands: [rereplicateCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(rereplicateBlock.failedCommands).toHaveLength(1);
          expect(rereplicateBlock.executedCommands).toEqual([]);
        }).pipe(Effect.provide(AsyncLive)),
    );
```

Two notes for the implementer: (1) the first test in this file is the template — if a drain helper or `getFrontendState` param there differs from the above, follow the file, not this plan; (2) the `currentServiceIndex: 2` assertion holds because this test's service processed exactly two commands (create = index 1, delete = index 2) — service repos are keyed per test by `serviceName: 'app'`, shared with the first spec, so if index numbers collide across tests, key isolation has changed and the assertion should pivot to `expect.any(Number)` plus the registration/row emptiness checks, which are the real invariants.

- [ ] **Step 3: Run the workerd spec to verify it fails**

Run: `pnpm nx run system-worker:test:workerd -- src/FrontendRepo/FrontendRepo.workerd.spec.ts`
Expected: FAIL — the new test's `accountDeleteState.registrations` assertion fails (registration row still present) while `products` is already empty, because `commitAppliedMutationTx` deletes the row (Task 2) but nothing releases the registration yet.

- [ ] **Step 4: Implement registration release in `handleServiceBlocks`**

In `packages/system-worker/src/AccountRepo/handleServiceBlocks/handleServiceBlocks.ts`, immediately after the `commitAppliedMutationTx` call (line 103-107) and before `relevantMutations.push(mutation);`:

```typescript
            if (mutation.operationName === 'delete') {
              tx.delete(accountRepoDrizzleSchemas.replicatedResources)
                .where(
                  and(
                    eq(
                      accountRepoDrizzleSchemas.replicatedResources.serviceName,
                      serviceName,
                    ),
                    eq(
                      accountRepoDrizzleSchemas.replicatedResources.modelName,
                      mutation.modelName,
                    ),
                    eq(
                      accountRepoDrizzleSchemas.replicatedResources.resourceId,
                      mutation.resourceId,
                    ),
                  ),
                )
                .run();
            }
```

`and`, `eq`, and `accountRepoDrizzleSchemas` are already imported in this file (the registration lookup at lines 77-96 uses all three).

- [ ] **Step 5: Run the workerd spec to verify it passes**

Run: `pnpm nx run system-worker:test:workerd -- src/FrontendRepo/FrontendRepo.workerd.spec.ts`
Expected: PASS (both tests — the pre-existing replication test must still pass).

Run the full system-worker suites: `pnpm nx test system-worker && pnpm nx run system-worker:test:workerd && pnpm nx run system-worker:ts`
Expected: all PASS / exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/system-worker/src/AccountRepo/handleServiceBlocks/handleServiceBlocks.ts packages/system-worker/src/fixtures/system.ts packages/system-worker/src/FrontendRepo/FrontendRepo.workerd.spec.ts
git commit -m "feat(system-worker): release replica registration on service delete"
```

---

### Task 5: optimistic delete staging in browser sessions

**Files:**
- Modify: `packages/core/src/fixtures/system.ts` (add `deleteList` contract; register on `main`)
- Test (create): `packages/core/src/session/deleteList.node.spec.ts`

**Interfaces:**
- Consumes: `deleteMutation` (Task 1), the `delete` pipeline (Task 2), existing session machinery (`makeSession`, `stageCommand`, `applyFrontendMutationTx` delegation — no session code changes needed).
- Produces: fixture contract `deleteList` (`commandName: 'deleteList'`, `payload: { id }`) available to `main` frontend contracts for any future session/actor specs.

The session staging path needs no implementation changes: `stageCommand` runs `makeMutations` (ownership check) then `applyFrontendMutationTx`, which delegates every non-replicate operation to `applyMutationTx` — the delete case from Task 2 applies optimistically and captures the full-row inverse for rollback. This task proves it.

- [ ] **Step 1: Add the `deleteList` fixture contract**

In `packages/core/src/fixtures/system.ts`:

Add to the imports (after the `createMutation` import):

```typescript
import { deleteMutation } from '../contracts/deleteMutation.ts';
```

Add after the `updateList` contract (line ~128):

```typescript
export const deleteList = makeContract({
  commandName: 'deleteList',
  payload: {
    id: primitives.id({ model: List }),
  },
  program: ({ payload }) =>
    Effect.all({
      deleted: deleteMutation({
        model: List,
        resourceId: payload.id,
      }),
    }),
  version: '1.0.0',
});
```

Register it on the frontend controller (line ~131):

```typescript
  contracts: {
    createList,
    createItem,
    updateList,
    deleteList,
  },
```

- [ ] **Step 2: Write the failing session spec**

Create `packages/core/src/session/deleteList.node.spec.ts` (structure mirrors `createList.node.spec.ts` exactly):

```typescript
import { it } from '@effect/vitest';
import { Effect, Either, Layer, Redacted } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeDrizzleRelationsFromModels } from '../drizzle/makeDrizzleRelations.ts';
import { makeResourceDrizzleSchemas } from '../drizzle/makeDrizzleSchemas.ts';
import { makeMigratedInMemoryWasmSqliteDb } from '../drizzle/makeMigratedInMemoryWasmSqliteDb.ts';
import { main, mainModels } from '../fixtures/system.ts';
import { PublishableKey } from '../services/PublishableKey.ts';
import { SignatureFactory } from '../services/SignatureFactory.ts';
import { ZerospinApisUrl } from '../services/ZerospinApisUrl.ts';
import { IncrementalMonotonicFactory } from '../test-utils/IncrementalMonotonicFactory.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { decodeRpc } from '../utils/decodeRpc.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { makeSession } from './makeSession.ts';
import {
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import { sessionRepoSchema } from './sessionRepoTables.ts';
import type { ISessionId } from './types.ts';

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('sessionDeleteList'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
  AsyncLive,
  Layer.succeed(ZerospinApisUrl, 'https://api.example.com/'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  Layer.succeed(SignatureFactory, () => Effect.succeed({ actorId: 'usr_1' })),
);

const makeSessionDb = Effect.gen(function* () {
  const models = mainModels;
  const schema = {
    ...makeResourceDrizzleSchemas(models),
    ...sessionRepoSchema,
  };
  const relations = makeDrizzleRelationsFromModels(models);
  const dbConfig = makeDbConfig({ schema, relations });
  const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });

  const sessionId = 'sesn_1' as ISessionId;
  const session = makeSession({
    frontend: main,
    sessionId,
  });
  session.store.setState({
    sessionId,
    accountId: 'acct_1',
    accountName: main.accountName,
    actorId: 'usr_1',
    systemWorkerName: 'stub-deploy',
    db,
    schema,
    models,
    vfsName: null,
    isInitialized: true,
    syncCursor: null,
  });

  return { db, models, session };
});

describe('deleteList', () => {
  it.layer(TestLayer)(it => {
    it.effect('stages an optimistic delete with a full-row inverse', () =>
      Effect.gen(function* () {
        const { db, models, session } = yield* makeSessionDb;

        yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_1',
              name: 'List 1',
              userId: 'usr_1',
            },
          }),
        ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));

        const staged = yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'deleteList',
            payload: {
              id: 'lst_1',
            },
          }),
        ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));

        const stagedRows = db
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .all();
        const listRows = db.select().from(models.list.drizzleSchema).all();
        const optimisticRows = db
          .select()
          .from(sessionOptimisticAppliedMutationDrizzleSchema)
          .all();

        expect(stagedRows).toHaveLength(2);
        expect(stagedRows[1]?.id).toBe(staged.id);
        expect(listRows).toHaveLength(0);
        expect(optimisticRows).toHaveLength(2);
        const deleteMutations = JSON.parse(
          optimisticRows[1]?.mutations ?? '[]',
        ) as Array<{
          operationName: string;
          inverseOperation: string;
        }>;
        expect(deleteMutations).toHaveLength(1);
        expect(deleteMutations[0]?.operationName).toBe('delete');
        expect(
          JSON.parse(deleteMutations[0]?.inverseOperation ?? 'null'),
        ).toMatchObject({
          resource: {
            id: 'lst_1',
            name: 'List 1',
          },
        });
      }),
    );

    it.effect('rolls back the stage transaction for a missing row', () =>
      Effect.gen(function* () {
        const { db, models, session } = yield* makeSessionDb;

        const maybeStaged = yield* Effect.promise(() =>
          session.stageCommand({
            contractName: 'deleteList',
            payload: {
              id: 'lst_missing',
            },
          }),
        ).pipe(
          Effect.flatMap(encoded => decodeRpc(encoded)),
          Effect.either,
        );

        const stagedRows = db
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .all();
        const listRows = db.select().from(models.list.drizzleSchema).all();
        const optimisticRows = db
          .select()
          .from(sessionOptimisticAppliedMutationDrizzleSchema)
          .all();

        expect(Either.isLeft(maybeStaged)).toBe(true);
        expect(stagedRows).toHaveLength(0);
        expect(listRows).toHaveLength(0);
        expect(optimisticRows).toHaveLength(0);
      }),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm nx test @zerospin/core -- src/session/deleteList.node.spec.ts`
Expected: FAIL — `deleteList` is not a key of `main.contracts` until Step 1's fixture edit lands; with the fixture edit in place first, this step instead passes immediately. Do Step 1 and Step 2 together, then run: if it fails on anything other than a typo, the delete pipeline from Task 2 has a gap — stop and fix there, not here.

- [ ] **Step 4: Run the full core suite**

Run: `pnpm nx test @zerospin/core && pnpm nx run @zerospin/core:ts`
Expected: PASS / exit 0. Adding a contract to the `main` fixture controller can extend autogenerated or snapshot-based specs (e.g. `makeUnstagedCommand.autogenerate.node.spec.ts`); if a snapshot diff consists only of the new `deleteList` contract, regenerate with `pnpm nx test @zerospin/core -- -u` and re-review the diff before committing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/fixtures/system.ts packages/core/src/session/deleteList.node.spec.ts
git commit -m "feat(core): stage optimistic delete commands in sessions"
```

---

### Task 6: document delete semantics in the wiki

**Files:**
- Modify: `wiki/architecture/Blockchain.md`

**Interfaces:**
- Consumes: final line numbers of the files changed in Tasks 1–4 (verify before writing refs).
- Produces: architecture doc matching shipped behavior; the `updated:` frontmatter date bumped to the commit date.

- [ ] **Step 1: Add a "Delete mutations" section**

In `wiki/architecture/Blockchain.md`, insert a new section between `## replicateResource` and `## Account validation and canonical replacement`:

```markdown
## Delete mutations

`deleteMutation({ model, resourceId })` is the owner-only hard delete. Ownership
is the ordinary mutation rule enforced by `assertMutationsUseModels`: service
contracts delete their own service models, account contracts delete plain
account models, and an account contract emitting delete for a service model is
rejected (../../packages/core/src/contracts/assertMutationsUseModels.ts:29-69,
../../packages/core/src/contracts/deleteMutation.ts:1-30).

Authoritative application requires the live row: deleting a missing resource
fails the command with `mutation-row-not-found`, exactly like archive, update,
and move. The applied mutation stores the complete prior resource as its
`{ resource }` inverse, so a failed optimistic delete restores the local row
through the ordinary inverse path
(../../packages/core/src/contracts/applyMutationTx.ts,
../../packages/core/src/contracts/applyMutationInverseTx.ts).

Replica replay is idempotent: `commitAppliedMutationTx` issues a plain SQL
delete, so replaying a delete against an already-missing row is a no-op
(../../packages/core/src/contracts/commitAppliedMutationTx.ts).

When AccountRepo applies a registered service delete it also removes that
resource's `replicatedResources` row, releasing the otherwise-permanent
registration. Later service blocks that mention the resource skip it through
the existing unregistered-mutation branch and still advance the watermark, and
a new `replicateResource` command for the deleted id fails during canonical
replacement because ServiceRepo no longer holds a live row
(../../packages/system-worker/src/AccountRepo/handleServiceBlocks/handleServiceBlocks.ts).

Delete is a tombstone, not an erasure: finalized account, actor, service, and
frontend blocks are immutable archives, so the resource's bytes remain in
block history even after every live replica row is removed.
```

- [ ] **Step 2: Update the recovery-guarantees bullet**

Replace bullet 4 of `## Recovery guarantees`:

```markdown
4. Replication membership is released only by the owning service's delete
   mutation, which removes the account's registration row. Archive mutations
   keep the registration and the local row; there is still no
   account-initiated release API.
```

- [ ] **Step 3: Verify line references and bump the date**

For each `path:line-range` reference added in Step 1, open the file at HEAD and confirm the range covers the cited code; adjust to the real numbers. Set the frontmatter `updated:` to today's date. The `sources:` sha entries for files modified in Tasks 2 and 4 are stale after this feature; refresh them by running `/update-architecture` if available in the executing session, otherwise update each listed `sha:` with `git hash-object <path>` for the touched files only (`applyMutationTx.ts`, `applyMutationInverseTx.ts` if listed, `applyFrontendMutationTx.ts` if listed, `handleServiceBlocks.ts` — check the `sources:` block for which appear).

- [ ] **Step 4: Commit**

```bash
git add wiki/architecture/Blockchain.md
git commit -m "docs(wiki): document delete mutation semantics in Blockchain"
```

---

## Out of scope (deliberate)

- **Account-initiated release of a replica** — remains absent by design; delete of a service model is only valid from the owning service.
- **Erasure of block archives** (GDPR-style) — a different project: crypto-shredding or archive compaction, not a mutation.
- **Shopping/parking example contracts** — the mechanism ships with fixtures coverage; example projects can adopt `deleteMutation` when a product need appears.
- **Id reuse after delete** — ids are generated, not reused; nothing guards recreation with the same id and nothing should yet (YAGNI).

## Verification (after all tasks)

```bash
pnpm nx run @zerospin/core:ts
pnpm nx test @zerospin/core
pnpm nx run system-worker:ts
pnpm nx test system-worker
pnpm nx run system-worker:test:workerd
```

Expected: all exit 0.
