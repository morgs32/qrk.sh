# Plan 065 — Brick form autosave

1. Use shadcn Base UI Field and FieldGroup in the Form Inputs catalog, Brick sidebar forms, and lookup search fields. Stack the labels above the inputs for Figma Thumbnail, Link, Instagram, GitHub Repo, GitHub Profile, and GitHub Activity. Keep the specialized image, color, place, and icon interactions. Use a white surface for the standalone Studio sidebar.
2. Commit valid text after 500 ms idle, on blur, or on Enter. Commit place selection and image Apply immediately. Remove form-level Save and Cancel, and keep crop dialog controls.
3. Cancel on new text or navigation, preserve drafts on failure, and show help, validation, pending status, and failure inline. Keep provider lookup and decoding in the owning module.
4. Build Storybook, typecheck App and Bricks, and verify invalid text, duplicate triggers, superseded and unmounted lookups, and retry with a mocked provider. Manually check the catalog, Figma, Map Place, and Image, including editing a title after a crop.
5. Reconcile the module documentation. Update the glossary or write an ADR only if the implemented terminology or decisions warrant it.

```tsx
// The form owns validation and lookup. The shared hook owns timing and cancellation.
const { schedule, onBlur, onKeyDown } = useTextCommit(commitDraft);
```

## Remaining work

Storybook and import checks passed. App and Bricks TypeScript checks passed.
The scripted Link form passed with a mocked provider in jsdom, covering invalid
text, duplicate triggers, retry, stale responses, unmount, and accessible
associations for the field's description and error.

1. Manually verify the catalog and Figma feedback, Map Place selection, and
   Image Apply followed by a title edit. Archive after that check passes.
