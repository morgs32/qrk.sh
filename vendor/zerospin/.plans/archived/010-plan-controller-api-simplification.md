# Controller API Simplification Implementation Plan

> Superseded: actor controllers now declare explicit `models` and exactly one
> same-key, same-object `selection` per model. See
> `wiki/architecture/Blockchain.md` for the current service-replication design.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `selections` the sole model declaration on `makeActorController`, dissolve `makeSurfaceController` into a `frontends` binding record on the actor, and hard-rename every `surface*` identifier (`surfaceName → frontendName`, surface commands → actor commands) with no data migration.

**Architecture:** Additive primitives land first (`makeSelection` optional `where`, `modelsFromSelections`, `makeContractAdapter`). Then one atomic core restructure replaces `models`+`surfaces` with `selections`+`frontends` and deletes `makeSurfaceController`. Downstream packages are updated package-by-package, followed by the mechanical rename sweep and a zero-`surfaceName` grep gate.

**Tech Stack:** TypeScript, Effect, drizzle-orm, Nx monorepo (pnpm), vitest node specs + `*.typecheck.ts` fixtures + workerd `*.zspec.ts`.

**Spec:** `.plans/archived/010-spec-controller-api-simplification.md`

## Global Constraints

- Run all tasks through nx with pnpm: `pnpm nx run-many -t typecheck test lint --projects=<affected>` (check exact target names with `pnpm nx show project core` before first use; NEVER guess flags).
- HARD rename: after the final task, `grep -ri "surfacename" packages examples --include="*.ts" -l` (excluding `dist/`) must return nothing, and `makeSurfaceController` must not exist. Persisted DBs are wiped by the user — write **no** data migrations.
- "frontend command" is an existing, different concept (`pushFrontendCommands`). Surface commands become **actor** commands, never "frontend commands".
- Every task ends with the affected projects' typecheck + tests green and a commit. Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Follow existing code style: `IProps`-style type names, `Effect.fn` named effects, factory functions validate at runtime with `throw new Error('makeX: …')` messages.

---

### Task 1: `makeSelection` — optional `where`

**Files:**
- Modify: `packages/core/src/models/makeSelection.ts:301-310`
- Test: `packages/core/src/models/makeSelection.node.spec.ts` (create or extend if it exists — check first with `ls packages/core/src/models/*.spec.ts`)

**Interfaces:**
- Produces: `makeSelection<MODEL>(props: { model: MODEL; where?: ISelectionWhereFn<MODEL> }): ISelection<MODEL>` — `where` defaults to `() => ({})`. Later tasks call `makeSelection({ model: Product })` with no `where`.

- [ ] **Step 1: Write the failing test**

```ts
// in packages/core/src/models/makeSelection.node.spec.ts
import { describe, expect, it } from 'vitest';
// reuse an existing model fixture import from the neighboring spec if present;
// otherwise build a minimal model with makeModel + primitives.text()

describe('makeSelection', () => {
  it('defaults where to select-all when omitted', () => {
    const selection = makeSelection({ model: User });
    expect(selection.where({ actorId: 'actr_1' as IActorId })).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test core -- makeSelection.node.spec`
Expected: FAIL — type error / `where` is `undefined`.

- [ ] **Step 3: Implement**

```ts
export function makeSelection<MODEL extends IModel>(props: {
  model: MODEL;
  where?: ISelectionWhereFn<MODEL>;
}): ISelection<MODEL> {
  const { model, where = () => ({}) } = props;
  return {
    model,
    where,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test core -- makeSelection.node.spec` → PASS. Then `pnpm nx typecheck core` → PASS.

- [ ] **Step 5: Commit** — `feat(core): make makeSelection where optional (select-all default)`

---

### Task 2: `modelsFromSelections` helper

**Files:**
- Create: `packages/core/src/models/modelsFromSelections.ts`
- Test: `packages/core/src/models/modelsFromSelections.node.spec.ts`

**Interfaces:**
- Consumes: `ISelection` from `./makeSelection.ts`, `IModel` from `./types.ts`.
- Produces: `modelsFromSelections<SELECTIONS extends Record<string, ISelection<IModel>>>(selections: SELECTIONS): { [K in keyof SELECTIONS]: SELECTIONS[K]['model'] }`. Used by Task 4 (makeActorController), Task 5+ (call-site boundaries such as `models: modelsFromSelections(mainActor.selections)`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import { makeSelection } from './makeSelection.ts';
import { modelsFromSelections } from './modelsFromSelections.ts';
// model fixtures as in Task 1

describe('modelsFromSelections', () => {
  it('maps each selection to its model', () => {
    const selections = {
      user: makeSelection({ model: User }),
      list: makeSelection({ model: List }),
    };
    expect(modelsFromSelections(selections)).toEqual({ user: User, list: List });
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm nx test core -- modelsFromSelections`

- [ ] **Step 3: Implement**

```ts
import { mapValues } from 'es-toolkit';

import type { ISelection } from './makeSelection.ts';
import type { IModel } from './types.ts';

export function modelsFromSelections<
  SELECTIONS extends Record<string, ISelection<IModel>>,
>(
  selections: SELECTIONS,
): { [K in keyof SELECTIONS]: SELECTIONS[K]['model'] } {
  return mapValues(selections, selection => selection.model) as {
    [K in keyof SELECTIONS]: SELECTIONS[K]['model'];
  };
}
```

- [ ] **Step 4: Run to verify PASS**, plus `pnpm nx typecheck core`.

- [ ] **Step 5: Commit** — `feat(core): add modelsFromSelections helper`

---

### Task 3: `makeContractAdapter` factory

**Files:**
- Create: `packages/core/src/contracts/makeContractAdapter.ts`
- Test: `packages/core/src/contracts/makeContractAdapter.node.spec.ts`

**Interfaces:**
- Consumes: `IContract`, `InferCommandPayload` from `../models/types.ts` / `./types.ts` (match the imports used in the current `surfaceController/types.ts:161-170`).
- Produces:

```ts
export type IContractAdapterEntry<
  FRONTEND_CONTRACT extends IContract = IContract,
  ACTOR_CONTRACT extends IContract = IContract,
> = {
  contract: ACTOR_CONTRACT;
  adapt: (props: {
    contract: FRONTEND_CONTRACT;
    payload: InferCommandPayload<FRONTEND_CONTRACT['payload']>;
  }) => Effect.Effect<InferCommandPayload<ACTOR_CONTRACT['payload']>, IAnyError>;
};

export function makeContractAdapter<
  FRONTEND_CONTRACT extends IContract,
  ACTOR_CONTRACT extends IContract,
>(props: IContractAdapterEntry<FRONTEND_CONTRACT, ACTOR_CONTRACT>): IContractAdapterEntry<FRONTEND_CONTRACT, ACTOR_CONTRACT>;

export const identityContractAdapt = ({ payload }: { contract: IContract; payload: unknown }) =>
  Effect.succeed(payload);
```

Task 4 consumes `IContractAdapterEntry` and `identityContractAdapt` for binding resolution.

- [ ] **Step 1: Failing test** — `makeContractAdapter` returns its props verbatim; `identityContractAdapt` yields the payload unchanged (run the Effect with `Effect.runSync`).
- [ ] **Step 2: Run to FAIL** — `pnpm nx test core -- makeContractAdapter`
- [ ] **Step 3: Implement** as the interface above (`return props;`).
- [ ] **Step 4: Run to PASS** + `pnpm nx typecheck core`.
- [ ] **Step 5: Commit** — `feat(core): add makeContractAdapter and identity adapter`

---

### Task 4: Core restructure — selections-only actor, `frontends` bindings, delete `makeSurfaceController`

This is the atomic core change. The repo may be red mid-task; it must be green at the commit. All files below change together.

**Files:**
- Rewrite: `packages/core/src/actorController/makeActorController.ts`
- Rewrite: `packages/core/src/actorController/types.ts` (actor types)
- Rewrite: `packages/core/src/surfaceController/types.ts` → binding types (`IFrontendBinding`, `IAnyFrontendBinding`, `IFrontendBindingProps`, `IModelAdapters`, `IContractAdapters`) — file renamed in Task 8; content changes now
- Delete: `packages/core/src/actorController/makeSurfaceController.ts`, `packages/core/src/actorController/makeSurfaceController.typecheck.ts`
- Modify: `packages/core/src/accountController/makeAccountController.ts:151-174` (iterate `actorController.frontends`), `packages/core/src/accountController/getSurfaceController.ts` (reads `.surfaces` → `.frontends`)
- Modify: `packages/core/src/fixtures/system.ts` (mainActor + userAccount)
- Rewrite: `packages/core/src/actorController/makeActorController.typecheck.ts`
- Modify: any other core file that reads `.surfaces` or `actorController.models` — find with `grep -rn "\.surfaces\b\|actorController.models" packages/core/src --include="*.ts"`

**Interfaces:**
- Consumes: `modelsFromSelections` (Task 2), `IContractAdapterEntry`/`identityContractAdapt` (Task 3), existing `makeSurfaceCommand` (renamed Task 8), `assertValidModels`, `IAuthenticate`.
- Produces (relied on by Tasks 5–7):
  - `makeActorController({ name, api?, selections, frontends, authorize? })`
  - `actorController.selections` (input passthrough), `actorController.frontends[name]` = resolved `IFrontendBinding`: `{ name, frontendController, models, contracts, modelAdapters, contractAdapters, authenticate, makeCommand }` — same field names today's `ISurfaceController` value carries, so downstream repos change only their access path (`.surfaces` → `.frontends`) in this task.
  - NO `models` field on the actor controller.

- [ ] **Step 1: Write the binding-resolution node spec (failing)**

Create `packages/core/src/actorController/makeActorController.node.spec.ts` additions (extend the existing spec file if present):

```ts
describe('makeActorController frontends resolution', () => {
  it('derives binding models from selections ∩ frontend model keys', () => {
    // fixture frontend has models { list, user }; give the actor selections
    // for { list, user } — binding.models must be { list: List, user: User }
    expect(Object.keys(actor.frontends.main!.models).sort()).toEqual(['list', 'user']);
  });

  it('excludes actor models absent from the frontend', () => {
    // actor selects an extra model the frontend does not carry
    // → binding.models must not contain it
  });

  it('fills identity contract adapters for every frontend contract', () => {
    const adapted = Effect.runSync(
      (actor.frontends.main!.contractAdapters.createList as Function)({
        contract: createList,
        payload: { id: 'lst_1', name: 'x', userId: 'usr_1' },
      }),
    );
    expect(adapted).toEqual({ id: 'lst_1', name: 'x', userId: 'usr_1' });
  });

  it('throws when frontends key does not match frontendController name', () => {
    expect(() =>
      makeActorController({ name: 'main', selections, frontends: { wrong: binding } }),
    ).toThrow(/frontends.wrong/);
  });

  it('throws when a modelAdapter is present but modelNames match', () => { /* … */ });
  it('exposes no models field on the controller', () => {
    expect('models' in actor).toBe(false);
  });
});
```

- [ ] **Step 2: Run to FAIL** — `pnpm nx test core -- makeActorController`

- [ ] **Step 3: Rewrite `makeActorController.ts`**

```ts
import '@zerospin/server-only';
import { Effect } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IAuthorizeFn } from '../authorize/makeAuthorize.ts';
import { identityContractAdapt } from '../contracts/makeContractAdapter.ts';
import type { IContractAdapterEntry } from '../contracts/makeContractAdapter.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import type { ISelection } from '../models/makeSelection.ts';
import { modelsFromSelections } from '../models/modelsFromSelections.ts';
import type { IAssertValidModels, IModel, IModels } from '../models/types.ts';
import { makeSurfaceCommand } from '../surfaceController/makeSurfaceCommand.ts'; // renamed makeActorCommand in Task 8
import type {
  IFrontendBinding,
  IFrontendBindingProps,
} from '../surfaceController/types.ts';

import type { IActorController, IAnyActorApi, IAnyServiceQuery } from './types.ts';

type ISelections = Record<string, ISelection<IModel>>;

type IProps<
  NAME extends string,
  SELECTIONS extends ISelections,
  FRONTENDS extends Record<string, IFrontendBindingProps>,
> = {
  name: NAME;
  selections: SELECTIONS &
    (IAssertValidModels<{ [K in keyof SELECTIONS]: SELECTIONS[K]['model'] }> extends never
      ? never
      : SELECTIONS);
  frontends: FRONTENDS;
  authorize?: IAuthorizeFn;
};
// NOTE: mirror the exact IAssertValidModels application style used today on
// `models` — `models: MODELS & IAssertValidModels<MODELS>` — by computing
// DERIVED_MODELS = { [K in keyof SELECTIONS & string]: SELECTIONS[K]['model'] }
// and applying `IAssertValidModels<DERIVED_MODELS>` to the selections prop.
// Keep the two overloads (api absent / api present) exactly as the current file does.

export function makeActorController(props) {
  const { name, api = {}, selections, frontends: frontendsProps, authorize = () => Effect.void } = props;

  const models = modelsFromSelections(selections);
  assertValidModels({ models, context: 'makeActorController' });

  mapValues(api, (query: IAnyServiceQuery, key) => {
    const queryKey = String(key);
    if (query.name !== queryKey) {
      throw new Error(
        `makeActorController: api.${queryKey} must have name "${queryKey}", received "${query.name}"`,
      );
    }
    return query;
  });

  const frontends = mapValues(frontendsProps, (binding, key) => {
    const frontendName = String(key);
    const {
      frontendController,
      authenticate,
      modelAdapters = {},
      contractAdapters = {},
    } = binding;

    if (frontendController.frontendName !== frontendName) {
      throw new Error(
        `makeActorController: frontends.${frontendName} must bind a frontendController with frontendName "${frontendName}", received "${frontendController.frontendName}"`,
      );
    }
    // (Until Task 8 lands the rename, the field is frontendController.surfaceName —
    // Task 8 renames it; this task reads `surfaceName` and Task 8's sweep updates it.)

    const bindingModels: Record<string, IModel> = {};
    for (const [modelKey, model] of Object.entries(models)) {
      if (frontendController.models[modelKey] === undefined) {
        continue;
      }
      bindingModels[modelKey] = model;
    }

    for (const [modelKey, bindingModel] of Object.entries(bindingModels)) {
      const frontendModel = frontendController.models[modelKey]!;
      const diverges = bindingModel.modelName !== frontendModel.modelName;
      const hasAdapter = modelKey in modelAdapters;
      if (diverges && !hasAdapter) {
        throw new Error(
          `makeActorController: frontends.${frontendName}.modelAdapters.${modelKey} is required when actor modelName "${bindingModel.modelName}" differs from frontend modelName "${frontendModel.modelName}"`,
        );
      }
      if (!diverges && hasAdapter) {
        throw new Error(
          `makeActorController: frontends.${frontendName}.modelAdapters.${modelKey} must not be set when actor and frontend modelName both equal "${frontendModel.modelName}"`,
        );
      }
    }
    for (const adapterKey of Object.keys(modelAdapters)) {
      if (bindingModels[adapterKey] === undefined) {
        throw new Error(
          `makeActorController: frontends.${frontendName}.modelAdapters.${adapterKey} has no matching binding model`,
        );
      }
    }

    const contracts: Record<string, unknown> = {};
    const resolvedContractAdapters: Record<string, unknown> = {};
    for (const [contractKey, frontendContract] of Object.entries(frontendController.contracts)) {
      const override = (contractAdapters as Record<string, IContractAdapterEntry>)[contractKey];
      if (override !== undefined) {
        contracts[contractKey] = override.contract;
        resolvedContractAdapters[contractKey] = override.adapt;
      } else {
        contracts[contractKey] = frontendContract;
        resolvedContractAdapters[contractKey] = identityContractAdapt;
      }
    }
    for (const adapterKey of Object.keys(contractAdapters)) {
      if (frontendController.contracts[adapterKey] === undefined) {
        throw new Error(
          `makeActorController: frontends.${frontendName}.contractAdapters.${adapterKey} is not a frontend contract`,
        );
      }
    }

    const makeCommand = (commandProps: never) =>
      makeSurfaceCommand({
        contracts,
        accountName: frontendController.accountName,
        actorName: frontendController.actorName,
        systemName: frontendController.systemName,
        ...commandProps,
        surfaceName: frontendName, // becomes frontendName: in Task 8
      });

    return {
      name: frontendName,
      frontendController,
      models: bindingModels,
      contracts,
      modelAdapters,
      contractAdapters: resolvedContractAdapters,
      authenticate,
      makeCommand,
    };
  });

  return { name, selections, frontends, authorize, api };
}
```

Type-level, replace `IModelAdapters` (required/forbidden keys machinery stays, now keyed by `DERIVED_MODELS` vs `FRONTEND_MODELS`) and define in `surfaceController/types.ts`:

```ts
export type IFrontendBindingProps<
  /* generics mirroring today's ISurfaceController params minus NAME/SURFACE_MODELS,
     with ACTOR_MODELS (derived from actor selections) in place of SURFACE_MODELS */
> = {
  frontendController: IFrontendController<…>;
  authenticate: IAuthenticate<ACTOR_MODELS, keyof ACTOR_MODELS & string, keyof ACTOR_MODELS & string, SIGNATURE_SCHEMA, RESOLVED_CONTRACTS>;
  modelAdapters?: IModelAdapters<FRONTEND_MODELS, ACTOR_MODELS>;   // bare adapt functions, same IModelAdapter shape as today
  contractAdapters?: Partial<Record<keyof FRONTEND_CONTRACTS & string, IContractAdapterEntry>>;
};

export type IFrontendBinding<…> = { name; frontendController; models; contracts; modelAdapters; contractAdapters; authenticate; makeCommand };
export type IAnyFrontendBinding = { /* today's IAnySurfaceController shape */ };
```

Threading `ACTOR_MODELS` from `selections` into `frontends` values requires the
`FRONTENDS` generic to be constrained *after* `SELECTIONS` in the
`makeActorController` signature: `FRONTENDS extends Record<string, IFrontendBindingProps<DERIVED_MODELS>>`.
Iterate against the typecheck fixtures in Step 5 until the fixture's
`@ts-expect-error` lines behave.

- [ ] **Step 4: Update in-core call sites**

- `packages/core/src/fixtures/system.ts`: `mainActor` drops `models:`, `surfaces:` becomes `frontends: { main: { frontendController: main, authenticate: <existing fn> } }` (contracts/adapters/name deleted — the fixture's surface contracts equal the frontend's three contracts, so identity resolution reproduces them). `userAccount` becomes `models: modelsFromSelections(mainActor.selections)`, `contracts: mainActor.frontends.main!.contracts`.
- `packages/core/src/accountController/makeAccountController.ts:154`: `actorController.surfaces` → `actorController.frontends` (variable names `surfaceKey`/`surfaceController` → `frontendName`/`frontendBinding`; error message text updated to `…frontends.${frontendName}.models.…`).
- `packages/core/src/accountController/getSurfaceController.ts`: change lookups from `.surfaces` to `.frontends` (file rename happens in Task 8).
- Delete `makeSurfaceController.ts` + its typecheck file.

- [ ] **Step 5: Rewrite `makeActorController.typecheck.ts`**

Keep the frontend/model/contract fixtures at the top; replace all actor cases:

```ts
const _selectionsOnly = makeActorController({
  name: 'main',
  selections: {
    list: makeSelection({ model: List }),
    user: makeSelection({ model: User }),
  },
  frontends: {
    main: {
      frontendController: frontend,
      authenticate: () =>
        Effect.succeed({ actorId: 'usr_1' as const, accountId: 'acct_1' as const }),
    },
  },
});
void _selectionsOnly;

// @ts-expect-error CoreTypeError — selections key must equal model.modelName
makeActorController({
  name: 'main',
  selections: { wrongKey: makeSelection({ model: User }) },
  frontends: { … },
});

// @ts-expect-error CoreTypeError — ref target model must be in controller models
makeActorController({
  name: 'main',
  selections: { list: makeSelection({ model: List }) }, // List refs User, User missing
  frontends: { … },
});

// @ts-expect-error — selections is required
makeActorController({ name: 'main', frontends: { … } });

// @ts-expect-error — contractAdapters key must be a frontend contract
// (makeContractAdapter entry under a key not on frontend.contracts)
```

- [ ] **Step 6: Green the core package**

Run: `pnpm nx run-many -t typecheck test -p core` → PASS (fix fallout inside core only; downstream packages are Tasks 5–7 and may be red at the workspace level — do NOT run workspace-wide gates in this task).

- [ ] **Step 7: Commit** — `feat(core)!: selections-only makeActorController with frontends bindings; delete makeSurfaceController`

---

### Task 5: system-worker — consume selections + frontends

**Files:**
- Modify: `packages/system-worker/src/fixtures/system.ts`
- Modify: `packages/system-worker/src/ActorRepo/ActorRepo.ts:184`
- Modify: `packages/system-worker/src/ActorRepo/bootstrap/bootstrap.ts:73,89`
- Modify: `packages/system-worker/src/ActorRepo/handleAccountBlocks/handleAccountBlocks.ts:101-108`
- Modify: `packages/system-worker/src/ActorRepo/dumpActorModelResources/dumpActorModelResources.ts:35-44`
- Modify: every system-worker file matched by `grep -rln "\.surfaces\b\|surfaceController" packages/system-worker/src --include="*.ts"` — access-path change `.surfaces` → `.frontends` (identifier renames wait for Task 8)

**Interfaces:**
- Consumes: `actorController.selections`, `actorController.frontends`, `modelsFromSelections` from `@zerospin/core/models/modelsFromSelections`.

- [ ] **Step 1: Update the fixture** — `packages/system-worker/src/fixtures/system.ts`: drop `models:` from `mainActor` (its selections already cover the four models); replace `surfaces: { main: makeSurfaceController({ name, frontendController, models, contracts, modelAdapters, contractAdapters, authenticate }) }` with `frontends: { main: { frontendController: main, authenticate: <existing fn> } }`. NOTE: this frontend carries a fifth model `product` and a `replicateProduct` contract; binding models resolve to the actor's four (product excluded automatically), and all six contracts resolve with identity adapters. Update the account controller lines analogous to core fixture (`modelsFromSelections`, `.frontends.main!.contracts`).

- [ ] **Step 2: Update the four consumer files** (exact replacements):

- `ActorRepo.ts:184`: `models: actorController.models,` → `models: modelsFromSelections(actorController.selections),` (add the import). Delete the now-stale comment block at lines 191-194 if it repeats the old models/selections duality.
- `bootstrap.ts:73`: `Object.keys(actorController.models)` → `Object.keys(actorController.selections)`.
- `bootstrap.ts:89` block: replace the `getByKeyOrThrow({ record: actorController.models, … })` with

```ts
const selection = yield* getByKeyOrThrow({
  record: actorController.selections,
  key: modelName,
  recordKind: 'actor selections',
});
const model = selection.model;
```

- `handleAccountBlocks.ts:101`: `if (actorController.models[mutation.modelName] === undefined)` → `if (actorController.selections[mutation.modelName] === undefined)`; line 106 `models: actorController.models` → `models: modelsFromSelections(actorController.selections)` (hoist the derivation above the loop: `const actorModels = modelsFromSelections(actorController.selections);`).
- `dumpActorModelResources.ts`: delete the `actorController.models` lookup; keep only

```ts
const selection = yield* getByKeyOrThrow({
  record: actorController.selections,
  key: modelName,
  recordKind: 'actor selections',
});
const rows = selectAllFromSelection({ db: db as never, selection, actorId }).all();
```

- [ ] **Step 3: Sweep `.surfaces` access paths** — for each file from the grep in **Files**, change property access `.surfaces` → `.frontends` (e.g. `actorController.surfaces[surfaceName]` → `actorController.frontends[surfaceName]`). Variable/parameter renames happen in Task 8.

- [ ] **Step 4: Green** — `pnpm nx run-many -t typecheck test -p system-worker` → PASS (workerd specs included if they run under the `test` target; otherwise also run the project's zspec target — check with `pnpm nx show project system-worker`).

- [ ] **Step 5: Commit** — `refactor(system-worker): consume actor selections and frontends`

---

### Task 6: system package, sdk, react, shared-worker

**Files:**
- Modify: `packages/system/src/system.ts` (drops `models:`, `modelAdapters: {}`, identity `contractAdapters`, `makeSurfaceController` → `frontends` binding — same pattern as Task 5 Step 1)
- Modify: files found by `grep -rln "makeSurfaceController\|\.surfaces\b\|actorController.models" packages/sdk/src packages/react/src packages/shared-worker/src --include="*.ts"` — update imports/access paths; `packages/react/src/useApi.typecheck.ts` gets the new `makeActorController` shape (copy the pattern from Task 4 Step 5)
- Modify: `packages/core/src/system/makeSystem.node.spec.ts:82,119,174` — `models: mainActor.models` → `models: modelsFromSelections(mainActor.selections)`; `packages/core/src/accountController/makeAccountController.node.spec.ts` + `makeAccountController.typecheck.ts` — same substitutions

- [ ] **Step 1: Apply the fixture pattern** to `packages/system/src/system.ts` exactly as Task 5 Step 1.
- [ ] **Step 2: Update remaining grep hits** (imports of `makeSurfaceController` are deleted; `.surfaces` → `.frontends`; `actorController.models` → `modelsFromSelections(actorController.selections)`).
- [ ] **Step 3: Green** — `pnpm nx run-many -t typecheck test -p system,sdk,react,shared-worker,core` → PASS.
- [ ] **Step 4: Commit** — `refactor: migrate system, sdk, react, shared-worker to frontends bindings`

---

### Task 7: examples (shopping, parking)

**Files:**
- Modify: `examples/shopping/src/zerospin/system.ts`, `examples/parking/src/zerospin/system.ts` (fixture pattern from Task 5 Step 1; shopping's `product` selection becomes `makeSelection({ model: Product })` — where omitted)
- Modify: example tests touching renamed access paths: `examples/shopping/tests/**`, `examples/parking/tests/**` (grep per file list in the survey; only access-path changes here)

- [ ] **Step 1: Apply the pattern** to both example systems.
- [ ] **Step 2: Green** — run both example projects' typecheck/tests via `pnpm nx run-many -t typecheck test -p shopping,parking` (confirm project names with `pnpm nx show projects | grep -i 'shopping\|parking'`). Playwright/e2e specs run only if part of the default `test` target; otherwise defer them to Task 9's full gate.
- [ ] **Step 3: Commit** — `refactor(examples): migrate shopping and parking to frontends bindings`

---

### Task 8: The hard rename sweep

No behavior change; identifiers, files, columns, routes, error codes.

**Files:** repo-wide `*.ts` (excluding `dist/`, `node_modules/`), plus file/directory renames:

| Rename | Kind |
| --- | --- |
| `surfaceName` → `frontendName` | identifier everywhere: props, fields, route patterns (`/:surfaceName`), drizzle columns (`sessionRepoTables.ts`, `accountBlockDrizzleSchemas.ts`, `shared-worker` user schema **and its `migrations.ts` SQL** — regenerate/hand-edit the CREATE TABLE statements; no ALTER migrations, DBs are wiped) |
| `ISurfaceCommand` → `IActorCommand`, `commandType: 'surface'` → `'actor'` | `contracts/types.ts`, `CommandSchema.ts`, session command shapes, all consumers |
| `makeSurfaceCommand` → `makeActorCommand` | file + identifier: `surfaceController/makeSurfaceCommand.ts` → `frontendBinding/makeActorCommand.ts` |
| `packages/core/src/surfaceController/` → `packages/core/src/frontendBinding/` | `git mv`, update all import paths |
| `ISurfaceController`/`IAnySurfaceController` → `IFrontendBinding`/`IAnyFrontendBinding` | already-reshaped types get final names |
| `getSurfaceController.ts` → `getFrontendBinding.ts` | file + exported fn |
| `pushSurfaceCommands` → `pushActorCommands` | ActorRepo dir + op + RPC method + all public callers (including react `pushStagedCommands.ts`) |
| `IMergedActorSurfaceContracts` → `IMergedActorFrontendContracts`; `AccountContractsExtendSurface` → `AccountContractsExtendFrontend` | accountController types |
| `getAuthorizedActorSurfaces` → `getAuthorizedActorFrontends` | AuthorizationRepo dir + fn + callers |
| `surface-push-command-*` error codes → `actor-push-command-*` | `pushSurfaceCommands.ts` + any spec asserting the code |
| `pushedSurfaceCommands1.zspec.ts` → `pushedActorCommands1.zspec.ts` | test file rename + internal strings |
| remaining `surfaceController` variable names → `frontendBinding` | system-worker |

- [ ] **Step 1: Mechanical sweep.** Use ordered, reviewable substitutions (longest-first to avoid partial matches), e.g.:

```bash
cd /Users/morgs32/GitHub/zerospin
# preview each before applying:
grep -rl "surfaceName" packages examples --include="*.ts" | grep -v dist \
  | xargs sed -i '' 's/surfaceName/frontendName/g'
grep -rl "ISurfaceCommand" packages examples --include="*.ts" | grep -v dist \
  | xargs sed -i '' 's/ISurfaceCommand/IActorCommand/g'
# commandType literal:
grep -rl "'surface'" packages examples --include="*.ts" | grep -v dist   # REVIEW each hit manually — only commandType literals change
```

then the `git mv` renames and import-path fixes. Review every `'surface'` string hit by hand (route strings, recordKind labels, error codes, UI copy).

- [ ] **Step 2: Green, workspace-wide** — `pnpm nx run-many -t typecheck test lint` → PASS.
- [ ] **Step 3: Zero-surface gate**

```bash
grep -rin "surfacename\|surfacecontroller\|surfacecommand\|makesurface" packages examples --include="*.ts" | grep -v dist
```

Expected: no output. `grep -rin "surface" …` may legitimately hit unrelated words — review the residue; anything conceptual must go.

- [ ] **Step 4: Commit** — `refactor!: rename surface concept — frontendName, frontend bindings, actor commands`

---

### Task 9: Docs, wiki, and final verification

**Files:**
- Modify: `llm-wiki/**` files referencing `makeSurfaceController`, `surfaces:`, `models:` on actors, or `surfaceName` (find with grep); update code samples to the new API
- Modify: `CLAUDE.md`/READMEs if they mention surfaces (grep)

- [ ] **Step 1: Update wiki/docs code samples** to the Task 4 API shape.
- [ ] **Step 2: Full workspace gate** — `pnpm nx run-many -t typecheck test lint` and the example e2e/workerd targets deferred from Task 7 → PASS. Remind the user to wipe local replica/session DBs before running anything stateful.
- [ ] **Step 3: Re-run the zero-surface gate** from Task 8 including `vendor/` and `docs/` (spec/plan documents in `.plans/` are exempt — they describe the migration).
- [ ] **Step 4: Commit** — `docs: update wiki and docs for frontends API`
