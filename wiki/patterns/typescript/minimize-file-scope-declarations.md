# Keep declarations in the scope that uses them

Keep a convenience alias or single-use local value inside the callback that uses
it. Prefer direct member access when it makes the alias unnecessary.

```tsx
/**
 * Consume a component view directly inside the authored callback.
 * @bad A file-scope `const Bio = bioView.Component` used only by this callback.
 * @bad Running makeComponentView inside the render callback to avoid a file-scope value.
 */
export const githubProfileView = makeModuleView(githubProfileV1, {
  default: {
    component(props) {
      const { state } = props;
      return <bioView.Component bio={state.data.bio} />;
    },
  },
});
```

If a local alias helps a longer expression, declare it inside the consuming callback,
after destructuring its props. Reading `.Component` returns the existing function;
it does not create a new React component.

Keep factory results, sessions, and other values requiring a stable identity at
their owning lifetime. Narrow declaration scope without moving initialization or
side effects into rendering.
