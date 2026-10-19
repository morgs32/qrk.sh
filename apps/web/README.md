# Web

Run `pnpm nx run @qrk.sh/web:storybook` from the workspace root to browse the web
link styles at <http://127.0.0.1:10022>.

- **Docs** shows each link example with a copyable JSX snippet expanded below it.
  Individual stories also have a **Code** panel.
- **Web / Button Links** shows every button variant rendered as a link, plus
  the available sizes. Compose `Button asChild` with a direct Next.js `Link`
  child so the button owns its styling.
- **Web / UnderlinedLink** shows the reusable `UnderlinedLink` in `sm` (12px,
  default) and `lg` (16px) sizes, plus its orange `accent` variant.
  The home footer uses `sm`; Login uses `lg`; Dashboard uses `lg` and `accent`.
- **Web / Wordmark** shows the shared Silkscreen home link used on the home,
  Privacy, and Terms pages. Next.js supplies its font through the root layout;
  Storybook supplies the same font through its preview styles.
- **Web / OrderedBody** replaces the former `/ordered-body` demo route with
  nested documentation content and controls for list decorators and permalinks.
- **Web / OrderedOutline** shows outline navigation, including muted entries.

Shared components have their own stories; Dashboard appears as the `Accent`
story under **Web / UnderlinedLink**.

`UnderlinedLink` owns its underline styles. Pass `asChild` and a single direct
`next/link` child for client navigation. Without `asChild` it renders an anchor,
which Storybook and external URLs use. The app composes the same component with
TanStack Router's `Link`.

Web's `qrk/next-link-composition` Oxlint rule in `lint/nextLinkPlugin.mjs` allows
`next/link` only as the single direct child of the shared `Button` or
`UnderlinedLink` with explicit `asChild` or `asChild={true}`. It resolves
imported bindings, including aliases, and rejects shadowed or unrelated parents.
A spread after `asChild` must be followed by an explicit true `asChild` because
the spread could override it. `vite.config.mts` turns the rule off for
`Wordmark.tsx`, which owns its own `next/link`. Run `pnpm exec vp lint .` from
`apps/web` to apply the rule.

Use `pnpm nx run @qrk.sh/web:build-storybook` to produce a static Storybook.
