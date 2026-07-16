# llm-wiki patterns

Shareable code-shape guidance for LLM-assisted development. Vendored as a git subtree into any repo.

## Format

Each pattern is a small mock `.ts` file:

- **Code shows only the good pattern.**
- **`@bad` JSDoc tags** document anti-patterns to avoid (one tag per mistake).

```typescript
/**
 * Effect.fn generators take one props object.
 *
 * @bad Multiple positional args: `(system, commandName, payload)`.
 * @bad File-local `IProps` alias used only once — inline on the parameter.
 */
export const makeCommand = Effect.fn('makeCommand')(function* (props: {
  commandName: string;
  payload: unknown;
}) {
  const { commandName, payload } = props;
  return { commandName, payload };
});
```

## Conventions

| Rule       | Detail                                                     |
| ---------- | ---------------------------------------------------------- |
| `@bad`     | Imperative “Do not …” phrasing; one anti-pattern per tag   |
| Names      | Generic domain vocabulary — no repo-specific package paths |
| Stubs      | Import types from `../_stubs/` when needed                 |
| File names | kebab-case: `effect-fn-one-props-object.ts`                |
| Prose      | Short `.md` beside patterns when no code demo helps        |

## Routing

See [index.md](./index.md) for keyword → file lookup.

Zerospin-specific patterns live in the first-party tree `llm-wiki/patterns/`
(sibling of this vendored package in Zerospin).
