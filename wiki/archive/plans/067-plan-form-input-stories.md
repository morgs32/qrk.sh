# Plan 067 — Individual Brick input stories

1. Keep the Form Inputs Catalog and Scripted stories at their existing URLs.
   Give each of the 11 catalog components a Docs-only entry with a centered
   260px preview and its full TSX expanded underneath. Use the same Docs-only
   sidebar pattern for Buttons.
2. Keep one TSX file per example. Import it as the preview component and as raw
   text for the source. Use local object URLs for Image Upload and revoke them
   on replacement and unmount.
   [Storybook research](../../research/storybook-form-input-stories.md)
3. Build Bricks Storybook through Nx, typecheck Bricks, check the diff, and
   confirm all Docs pages, Catalog, and Scripted stories in the built index.
4. Reconcile this plan with the result and archive it after verification.
   The story examples use existing input terminology.

```tsx
import { TextInputExample } from "./TextInputExample";
import exampleSource from "./TextInputExample.tsx?raw";

const meta = {
  component: TextInput,
  // Keep the live story available to Docs and show only Docs in the sidebar.
  tags: ["autodocs", "!dev"],
  parameters: { layout: "centered", docs: { canvas: { sourceState: "shown" } } },
} satisfies Meta<typeof TextInput>;

export default meta;

export const Example = {
  // The preview and the copyable snippet both come from TextInputExample.tsx.
  render: () => <TextInputExample />,
  parameters: { docs: { source: { language: "tsx", code: exampleSource } } },
} satisfies StoryObj<Partial<Parameters<typeof TextInput>[0]>>;
```

## Verification

1. The Nx Bricks Storybook build and import check, Bricks typecheck, and
   `git diff --check` passed.
2. The built index contains 12 Docs entries and their backing stories tagged
   for Docs-only navigation. Catalog and all three Scripted stories retain
   their sidebar tags. Each built story bundle contains the exact example
   TSX and the expanded source setting.
3. The user verified the Docs-only entries, expanded source, and Catalog in
   Storybook and approved archival.

**Remaining work: None**
