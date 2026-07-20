# TypeScript

Use this doc when fixing TypeScript errors in this repo.

## Rules

1. Fix all type errors in all packages, apps, and examples.
2. Never coerce with `as any as` or similar shortcuts.
3. List non-obvious issues at the end so the user sees what was subtle.

## Workflow

1. Run the dashboard and site app typecheck from repo root:

```sh
pnpm --filter @qrk.sh/app typecheck
```

2. Capture all failing tasks and their error messages.
3. Fix errors in dependency order so upstream fixes clear downstream failures.
4. Prefer correct types over shortcuts.
5. Run the full typecheck again and confirm all tasks pass.

## Correct fixes over shortcuts

- If a function expects a specific object shape, pass that object instead of a single value and a cast.
- If a required field is missing, add it at the call site or in the type definition.
- If a subpath import is missing, add the right `exports` entry and ensure the exported file exists.
- If a workspace package relies on an app-local global type, move that type into a real module and import it.

## Common patterns

### Custom Vitest matchers

If the error is:

```text
Property 'toMatchProcedure' does not exist on type 'Assertion'
```

extend Vitest types with interface augmentation in a `.d.ts` file:

```ts
interface Assertion {
  toMatchProcedure(...args: unknown[]): void;
}
```

Do not replace the whole type with `type Assertion = ...`.

### Good vs bad: Next.js `params` with Effect `Schema` (same file as the page)

For a dynamic route page, validate `params` with **Effect `Schema`**: define **one `Schema.Struct`** in the **same module as the page** (above the default export), decode with **`Schema.decodeUnknownEither`**, and branch with **`Either.isLeft`** (e.g. call `notFound()` on the left). Do **not** add a sibling file that only exports a tiny struct for one page, and do **not** wrap **`decodeUnknownSync`** in **`try`/`catch`** when **`decodeUnknownEither`** already models failure.

- **Bad**: `brickCatalogRouteParamsSchema.ts` that only holds `Schema.Struct({ … })` imported by one `page.tsx`; or `try { decodeUnknownSync(schema)(raw) } catch { notFound() }`.

- **Good**: colocate in the route’s `page.tsx` (for example parallel routes under `apps/app/app/(site)/site/[siteId]/page/[pageId]/@leftDrawer/…`):

```ts
const BrickCatalogRouteParamsSchema = Schema.Struct({
  collectionName: Schema.String,
  brickId: Schema.String,
});

const decoded = Schema.decodeUnknownEither(BrickCatalogRouteParamsSchema)(rawParams);
if (Either.isLeft(decoded)) {
  notFound();
}
const { collectionName, brickId } = decoded.right;
```

Keep domain checks that the schema cannot express (e.g. `collectionName in collectionsHash`) **after** a successful decode.

### Good vs bad: Effect `Schema` constant names and `satisfies`

Name Effect schema values **PascalCase** (e.g. `BrickDragDefSchema`, `BrickCatalogRouteParamsSchema`), not camelCase. When a **domain type already exists** that the decoded value should match, constrain the struct with **`satisfies Schema.Schema<ThatType>`** so drift between schema fields and the type is a compile error.

- **Bad**: `const brickDragDefSchema = Schema.Struct({ … })` with no link to `ICollectionBrickDef`; or adding a throwaway `type Foo = { … }` next to the schema **only** to satisfy the compiler when the product model does not yet define `Foo`.

- **Good**: put `satisfies Schema.Schema<…>` on the **`Schema.Struct`** that describes the **parsed object** (see `BrickDragDefFromJsonStringSchema` in [`apps/app/components/home/useBrickDrawerStore.ts`](../../apps/app/components/home/useBrickDrawerStore.ts) and the `parseJson` subsection below).

If there is **no** existing type that should own the decoded shape, **do not** invent one in passing: agree on the canonical name and module with the team (or your past self in the issue), add that type where domain types live, then add `satisfies Schema.Schema<…>`. Until then, PascalCase the schema only (e.g. route `params` in `page.tsx`).

### Good vs bad: `Schema.parseJson` when the encoded value is a JSON string

Use **`Schema.parseJson`** when the value you decode is a **string** containing JSON (e.g. `DataTransfer.getData`, a raw request body string). That makes the schema’s **encoded** side a **`string`** and the **decoded** side your object. Apply **`satisfies Schema.Schema<DomainType>`** to the **`Schema.Struct` nested inside** `parseJson`, not to the `parseJson(...)` result—`satisfies` should still describe the **object** you get after JSON parse, aligned with the domain type.

- **Bad**: splitting into `const Obj = Schema.Struct({ … }) satisfies …` and `Schema.parseJson(Obj)` when you only ever consume a JSON string (extra indirection); or attaching `satisfies` only to the outer `parseJson` wrapper where it no longer reads as “this struct matches `DomainType`”.

- **Good**:

```ts
const BrickDragDefFromJsonStringSchema = Schema.parseJson(
  Schema.Struct({
    collectionName: Schema.String,
    collectionLabel: Schema.String,
    label: Schema.String,
    name: Schema.String,
    order: Schema.Number,
    w: Schema.Number,
    h: Schema.Number,
  }) satisfies Schema.Schema<ICollectionBrickDef>,
);
```

Decode at the call site with **`Schema.decodeUnknownEither`** (input is `unknown` / untrusted string) and **`Either.isLeft`**—**do not** pre-bind **`Schema.decodeUnknownSync`** into a `const` and **do not** wrap it in **`try`/`catch`** when failure should map to a value like `null`. Use **`Schema.decodeEither`** only when the input is already typed as the schema’s encoded type (here the wire value is still an unvalidated string, so **`decodeUnknownEither`** is the right API).

- **Bad**: `const decode = Schema.decodeUnknownSync(schema); … try { return decode(raw) } catch { return null }`.

- **Good**:

```ts
const decoded = Schema.decodeUnknownEither(BrickDragDefFromJsonStringSchema)(raw);
if (Either.isLeft(decoded)) {
  return null;
}
return decoded.right;
```

See [`apps/app/components/home/useBrickDrawerStore.ts`](../../apps/app/components/home/useBrickDrawerStore.ts) (`parseBrickDefFromDataTransfer`).

### Workspace package imports

When an app imports from a workspace package, TypeScript typechecks that dependency's source too.

Do not rely on globals that only exist inside one app's config. Export the needed types from a real module and import them.

## Response requirement

After fixing type errors, list the non-obvious issues in the reply.
