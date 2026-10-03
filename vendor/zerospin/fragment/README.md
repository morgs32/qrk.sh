# Fragment homepage replica

A TanStack Start app reproducing the Fragment homepage and the Accounting 101 and Quickstart guides. The page
content lives in `src/routes/index.tsx` and the visual system in `src/styles.css`.
The copied public font and customer logo assets are in `public/assets`.

```bash
pnpm install --filter fragment...
pnpm nx run fragment:dev
```

Open http://localhost:3030. Documentation includes `/handbook/accounting-101`
and `/guides/quickstart`, with shared navigation in `src/components/DocumentationPage.tsx`.
The complete supplied page content lives in `src/content/`. Accounting diagrams
preserve the export's captured visual state; they do not replay the source site's
animations. Its scoped static utility styles live alongside the HTML. Shared
layout styles live in `src/docs.css`. Quickstart code blocks support copying,
and its schema is downloadable locally. Links to pages not imported use the
reference site's URLs.

Build the production app with:

```bash
pnpm nx run-many -t ts lint build -p fragment
```

Preview components in Storybook with:

```bash
pnpm nx run fragment:storybook
```

Open http://localhost:6006. Build the static Storybook with
`pnpm nx run fragment:build-storybook`.
