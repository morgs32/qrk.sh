# TypeScript

Use this doc when fixing TypeScript errors in this repo.

## Rules

1. Fix all type errors in all packages, apps, and examples.
2. Never coerce with `as any as` or similar shortcuts.
3. List non-obvious issues at the end so the user sees what was subtle.

## Workflow

1. Run the full typecheck from repo root:

```sh
pnpm exec tsc -p tsconfig.json --noEmit
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

### Workspace package imports

When an app imports from a workspace package, TypeScript typechecks that dependency's source too.

Do not rely on globals that only exist inside one app's config. Export the needed types from a real module and import them.

## Response requirement

After fixing type errors, list the non-obvious issues in the reply.

