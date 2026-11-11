# Storybook source snippets for Brick inputs

1. Storybook 10.6 shows a story's source in the Canvas **Code** tab when
   `parameters.docs.codePanel` is enabled. Bricks already registers
   `@storybook/addon-docs`, so individual stories can opt in through their CSF
   metadata. [Storybook Code panel](https://storybook.js.org/docs/writing-docs/code-panel) · [Bricks configuration](../../apps/bricks/.storybook/main.ts)
2. CSF 3 gives each input its own component metadata and navigation title.
   Storybook can generate source from args and accepts explicit `code` to
   include the example's imports, local state, callbacks, and JSX options.
   [Storybook CSF](https://storybook.js.org/docs/api/csf) · [Storybook Source](https://storybook.js.org/docs/api/doc-blocks/doc-block-source)
3. The individual stories sit alongside the Catalog, which shows the controls
   together at their Studio sidebar width. [Form Inputs catalog](../../apps/bricks/src/react/FormInputs.stories.tsx)

## Inline source for Buttons and Form Inputs

1. Buttons and the 11 individual inputs each have a **Docs** page with the
   live preview and its source expanded directly below it. The story metadata
   uses `tags: ["autodocs", "!dev"]` to list only Docs in the sidebar and sets
   `parameters.docs.canvas.sourceState: "shown"`. Autodocs renders the first
   story through its Primary block, which uses the Docs Canvas. The source
   remains collapsible. Bricks already has the Docs addon and its story glob
   discovers the CSF files. [Docs-only stories](https://storybook.js.org/docs/writing-stories/tags#docs-only-stories) · [Primary block](https://storybook.js.org/docs/api/doc-blocks/doc-block-primary) · [Canvas sourceState](https://storybook.js.org/docs/api/doc-blocks/doc-block-canvas#sourcestate)
2. If the source must always be visible, a custom Docs page can pair a
   `Canvas` with `sourceState="none"` and a separate `Source` block for the
   same story. An attached MDX page would require adding an MDX story glob to
   Bricks. The ordinary story URL continues to use the Code addon tab.
   [Storybook MDX](https://storybook.js.org/docs/writing-docs/mdx) · [Source block](https://storybook.js.org/docs/api/doc-blocks/doc-block-source) · [Code panel](https://storybook.js.org/docs/writing-docs/code-panel) · [Bricks configuration](../../apps/bricks/.storybook/main.ts)
3. Each story imports the example as a component for the preview and as text
   with Vite's `?raw` suffix. It passes that text to
   `parameters.docs.source.code` so Docs shows the exact example, including its
   imports and any local state. [Buttons example](../../apps/bricks/src/react/ButtonExamples.tsx) · [Number Input example](../../apps/bricks/src/react/NumberInputExample.tsx) · [Storybook Source types](https://storybook.js.org/docs/api/doc-blocks/doc-block-source#type) · [Vite raw imports](https://vite.dev/guide/assets.html#importing-asset-as-string)
