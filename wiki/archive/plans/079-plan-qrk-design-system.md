# Plan 079 — Make Bricks the QRK design system

1. Use the Bricks stylesheet as the shared document theme in App, Web, and
   their Storybooks. Centralize light and dark tokens, Tailwind mappings,
   Geist and Geist Mono, and shared base styles. Keep Silkscreen for the wordmark.
2. Remove the per-control theme class and Storybook decorator. Portals inherit
   the document palette. Wall drag previews retain their copied font, color,
   and dark state. Site overrides are deferred.
3. Share the tinted Bricks field treatment at both heights. Create Site uses
   36px Input and InputGroup and the existing TextboxInput. Editor fields and
   Site Settings URL groups use 28px. The URL actions stay 24px.
4. Reuse the compact Bricks dialog for Create Site, Publish Site, and crop.
   Use the compact Bricks Select for Page controls and keep its popup start
   alignment. Migrate duplicate buttons, fields and checkboxes across the
   App and Web routes, retaining link, submit, and focus behavior.
5. Update the layout conventions and glossary to describe the implemented
   theme and control ownership.

```tsx
// Standalone form fields use the 36px default.
<Input id="create-site-name" />

// The group controls the height around the read-only input and its action.
<InputGroup variant="sm">
  <InputGroupInput aria-label="Share URL" value={publishedUrl} readOnly />
  <InputGroupAddon align="inline-end">
    <CopyButton text={publishedUrl} inline />
  </InputGroupAddon>
</InputGroup>
```

```tsx
// Keep the real route link while using Bricks button styling.
<Button nativeButton={false} render={<Link to={destination} role="link" />}>
  Open page
</Button>
```

## Verification

1. Typecheck App, Web, and Bricks. Run the Bricks import check and build all
   three Storybooks. Build App and Web and verify that the source has no
   remaining theme class references.
2. Exercise both field heights, group suffix and validity, compact dialog
   focus and dismissal, light and dark portal styling, and publish selection
   in the existing Storybooks.
3. The user performs manual verification on the existing local URLs after
   archival, per the November 12 workflow.

## Implementation and verification

1. The [shared stylesheet](../../../apps/bricks/src/components/brickStyles.css)
   is imported by App, Web, and their Storybooks. Web now loads Silkscreen
   from its installed Fontsource package for production and Storybook.
2. App, Web, and Bricks typechecks, the Bricks import check, both production
   builds, all three Storybook builds, the frozen offline lockfile check, and
   `git diff --check` passed. The application source has zero references to
   the former theme class.
3. Headless Chrome ran the compiled Storybook checks for 36px and 28px fields,
   suffix and pattern validation, compact dialog focus and dismissal,
   Select keyboard interaction and light/dark portal colors, publish
   selection, and the Web button link. These checks exercised built
   Storybook assets. The signed-in route walkthrough is user-owned.
4. The [layout conventions](../../brick-layout-conventions.md) and
   [glossary](../../glossary.md) describe the implemented ownership.

`+` adds a file, `~` updates existing files, and `−` removes superseded files.

```text
qrk.sh/
├── apps/
│   ├── bricks/  ~ theme, shared controls, package exports, and Storybook
│   ├── app/     ~ theme entry, route consumers, and stories
│   │            − superseded local controls
│   └── web/     ~ theme entry, typography, and Storybook
│                − superseded local Button and preview stylesheet
├── ~ pnpm-lock.yaml
└── wiki/
    ├── ~ brick-layout-conventions.md
    ├── ~ glossary.md
    └── + archive/plans/079-plan-qrk-design-system.md
```

## Remaining work

None. The user can perform manual verification on the existing local URLs.
