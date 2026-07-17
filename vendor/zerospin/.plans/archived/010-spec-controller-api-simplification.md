# Controller API Simplification: selections-only actors, frontends replace surfaces

**Date:** 2026-07-10 (v2 — supersedes v1, which kept `makeSurfaceController`)
**Status:** Superseded by explicit actor `models` plus exact matching
`selections`; see `wiki/architecture/Blockchain.md` for the current design.

## Problem

`makeActorController` and `makeSurfaceController` both require props that are
derivable from other props, producing redundant declarations at every call
site:

- **Actor:** a model can be named three times — `models.user`, the
  `selections.user` key, and `model: User` inside `makeSelection`. After
  construction, `models` is fully derivable from `selections`.
- **Surface:** `name` duplicates `frontendController.surfaceName`; every call
  site passes identity `contractAdapters` for every contract and
  `modelAdapters: {}`; and the surface's `models` always equal the *actor's*
  model set (verified across shopping, parking, and all three fixture
  systems — including the system-worker fixture, where the surface's four
  models are a strict subset of the frontend's five because `product` is
  replication-only).

That last observation is why v1's "derive surface models from the frontend"
was wrong, and why the surface layer can be dissolved entirely: the actor
already knows the models; the surface adds only `frontendController`,
`authenticate`, and (rarely) adapters.

## Design

### Part A: `makeActorController` — selections only

**Input.** Drop the `models` prop. `selections` becomes required and is the
sole declaration of the actor's model set. `makeSelection.where` becomes
optional, defaulting to `() => ({})` (select-all).

**Output.** The controller exposes only
`{ name, selections, frontends, authorize, api }` — no `models` field.
Anyone needing a model reads `selections[name].model`; where a full
`IModels` record is genuinely needed, use the new exported helper:

```ts
// packages/core/src/models/modelsFromSelections.ts
export function modelsFromSelections<
  SELECTIONS extends Record<string, ISelection<IModel>>,
>(selections: SELECTIONS): { [K in keyof SELECTIONS]: SELECTIONS[K]['model'] };
// implementation: mapValues(selections, s => s.model)
```

**Validation.** `assertValidModels` runs over
`modelsFromSelections(selections)`. Type-level, `IAssertValidModels` applies
to `{ [K in keyof SELECTIONS]: SELECTIONS[K]['model'] }` — this preserves the
existing "key must equal `model.modelName`" and "ref target must be in
controller models" checks.

**Types.** `IActorController` loses its `MODELS` parameter; the
`'Actor selection keys must be actor model keys'` `ITypeError` is deleted.

### Part B: frontends replace surfaces

`makeSurfaceController` is deleted. Its inputs move onto
`makeActorController` as a `frontends` record, keyed by the frontend's name:

```ts
export const shopperActor = makeActorController({
  name: 'shopper',
  api: shopperApi,
  selections: {
    user: makeSelection({ model: User, where: ({ actorId }) => ({ actorId }) }),
    cart: makeSelection({ model: Cart, where: ({ actorId }) => ({ user: { actorId } }) }),
    cartItem: makeSelection({ model: CartItem, where: ({ actorId }) => ({ cart: { user: { actorId } } }) }),
    product: makeSelection({ model: Product }), // where omitted = select-all
  },
  frontends: {
    web: {
      frontendController: shopperFrontend, // key must equal frontendController.frontendName
      authenticate: ({ signature, db, makeAccountCommand, finalizeAccountCommands }) => ...,
      // only when the actor model for a key diverges from the frontend model:
      modelAdapters: {
        cart: actorResource => Effect.succeed({ ... }), // actor resource → frontend resource
      },
      // only when a contract diverges from the frontend contract:
      contractAdapters: {
        addToCart: makeContractAdapter({
          contract: ActorAddToCart, // divergent actor-side contract
          adapt: ({ payload }) => Effect.succeed({ ... }), // frontend payload → actor payload
        }),
      },
    },
  },
});
```

Binding-by-binding resolution (inside `makeActorController`), producing the
same runtime payload today's surface controller carries:

- **`name`** — the `frontends` key; must equal
  `frontendController.frontendName` (the renamed `surfaceName`).
- **`models`** — the actor's explicit `models` registry intersected with
  `frontendController.models` by key. Every actor model has exactly one
  same-key selection that references the same model object. Account-owned
  models use ordinary mutations; registered `IServiceModel` rows enter through
  `replicateResource` and then use the same actor/frontend graph path.
- **`modelAdapters`** — optional record of *bare functions*
  `(actorResource) => Effect<frontendResource>`; no `makeModelAdapter`
  wrapper needed because both end models are in scope:
  `models[K]` and `frontendController.models[K]`. Runtime rule: an
  adapter at key `K` is required iff
  `models[K].modelName !== frontendController.models[K].modelName`,
  and forbidden when they match (same spirit as today's checks, now enforced
  in `makeActorController`).
- **`contracts`** — `frontendController.contracts`, overridden per-key by
  adapter-carried contracts. No subsetting (no call site subsets contracts).
- **`contractAdapters`** — optional; entries built with the new
  `makeContractAdapter({ contract, adapt })` (the divergent actor-side
  contract can't be inferred from a bare payload-mapping function). Every
  frontend contract without an entry resolves to the frontend contract itself
  plus the identity adapter `({ payload }) => Effect.succeed(payload)`.
- **`authenticate`** — unchanged semantics; its `db` is typed from the
  binding's resolved models (derivable because `selections` and `frontends`
  live in the same `makeActorController` generic scope).
- **`makeCommand`** — unchanged; built per binding as today.

The resolved binding type is `IFrontendBinding` (replacing
`ISurfaceController`), exposed at `actorController.frontends[name]`.

### Part C: full rename, surface → frontend/actor

The "surface" concept disappears. Two rename families, chosen to avoid
colliding with the *existing* frontend-command concept (commands staged on
the frontend replica — `pushFrontendCommands` — are distinct from commands
applied actor-side):

**Controller-side artifacts → "frontend" naming:**

| Old | New |
| --- | --- |
| `surfaceName` (props, fields, route params, DB columns) | `frontendName` |
| `makeFrontendController({ surfaceName })` | `makeFrontendController({ frontendName })` |
| `ISurfaceController` / `IAnySurfaceController` | `IFrontendBinding` / `IAnyFrontendBinding` |
| `actorController.surfaces` | `actorController.frontends` |
| `packages/core/src/surfaceController/` | `packages/core/src/frontendBinding/` |
| `getSurfaceController` | `getFrontendBinding` |
| `getAuthorizedActorSurfaces` | `getAuthorizedActorFrontends` |
| `IMergedActorSurfaceContracts` | `IMergedActorFrontendContracts` |
| `AccountContractsExtendSurface` | `AccountContractsExtendFrontend` |

**Command-side artifacts → "actor" naming** (a surface command is a command
applied actor-side; "frontend command" is already taken):

| Old | New |
| --- | --- |
| `ISurfaceCommand` | `IActorCommand` |
| `commandType: 'surface'` | `commandType: 'actor'` |
| `makeSurfaceCommand` | `makeActorCommand` |
| `pushSurfaceCommands` (ActorRepo op + RPC) | `pushActorCommands` |
| `surface-push-command-*` error codes | `actor-push-command-*` |

**Persistence note:** `surfaceName` appears in drizzle columns
(`sessionRepoTables`, `accountBlockDrizzleSchemas`, shared-worker user
schema + its `migrations.ts`) and `commandType: 'surface'` in persisted
blocks. This is pre-1.0 with rebuildable replicas: columns are renamed in
schema definitions and the shared-worker migration SQL is regenerated, with
**no data migration** — existing local replicas/session DBs are discarded.
If any environment must preserve data, that is out of scope here and needs a
follow-up.

## Scope boundaries

- `frontendController`, `accountController`, and `serviceController` keep
  their `models` props — no selections concept there.
- No behavioral changes to replication, mutation application, or
  authorization — resolved runtime values are identical to today's; this is
  an API-shape refactor plus a mechanical rename.

## Call sites and consumers to update

- **Core factories/types:** `makeActorController.ts` (+ typecheck),
  `makeSelection.ts` (optional `where`), new `modelsFromSelections.ts`, new
  `makeContractAdapter.ts`; delete `makeSurfaceController.ts` (+ typecheck);
  rename/rework `surfaceController/` → `frontendBinding/`
  (`types.ts`, `makeSurfaceCommand.ts` → `makeActorCommand.ts`);
  `actorController/types.ts`, `contracts/types.ts`,
  `frontendController/*`, `accountController/*` (incl.
  `getSurfaceController.ts`, `makeAccountCommand.ts`), `system/types.ts`,
  `session/*` (command shapes, tables, `makeUnstagedCommand`,
  `fetchActor`, `fetchFrontendState`).
- **System definitions:** `examples/shopping`, `examples/parking`,
  `packages/core/src/fixtures`, `packages/system-worker/src/fixtures`,
  `packages/system/src/system.ts`. The account
  fixture's `models: mainActor.models` becomes
  `modelsFromSelections(mainActor.selections)` and
  `contracts: mainActor.surfaces.main!.contracts` becomes
  `mainActor.frontends.main!.contracts`.
- **system-worker:** ActorRepo (`ActorRepo.ts`, `bootstrap`,
  `handleAccountBlocks`, `dumpActorModelResources`,
  `pushSurfaceCommands` → `pushActorCommands`,
  `getPendingPushedCommands`), FrontendRepo, AccountRepo, AuthorizationRepo,
  block repos, `SystemWorker.ts`, `types.ts`.
- **Client packages:** `react` (`useApi`, `pushStagedCommands`,
  `makeBrowserUserController`, `acquireFrontendWebSocket`), `sdk`,
  `shared-worker` (schemas + migrations).
- **Tests/specs:** all `*.node.spec.ts`, `*.typecheck.ts`, workerd
  `*.zspec.ts`, and playwright specs touching the renamed identifiers
  (`pushedSurfaceCommands1.zspec.ts` → `pushedActorCommands1.zspec.ts`).
- **Docs/wiki:** `llm-wiki` pattern examples.

## Testing

- Full suite green: `pnpm nx run-many -t test typecheck lint` (or the
  repo's equivalent targets) after each task.
- Typecheck fixtures updated: omitting `selections` is a type error; a
  `frontends` key not matching `frontendController.frontendName` is a
  runtime error; a modelAdapter present when modelNames match (or absent
  when they differ) is an error; `makeContractAdapter` key outside frontend
  contracts is a type error.
- New unit coverage: `makeSelection` default `where`;
  `modelsFromSelections`; binding resolution (models from selections ∩
  frontend keys, identity contract adapters, divergent overrides).
- Workerd/e2e specs (shopping basic flow, parking flow) pass unchanged in
  behavior after the rename.
