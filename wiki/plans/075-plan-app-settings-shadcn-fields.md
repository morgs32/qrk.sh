# Plan 075 — Standardize App settings and creation fields

Adopt the shadcn Base UI Input, Field, Slider and Checkbox in App. Use the
existing Switch for Sticky navbar. Keep the current forms, validation,
upload flows, publish selection, and command payloads.
[Adoption audit](../research/shadcn-component-adoption-audit.md#app)

## Implementation and call sites

1. Port the existing [App Input](../../apps/app/components/ui/input.tsx#L5-L20)
   to the Base UI registry Input. Keep its slot, styles, native prop
   forwarding, and autofill policy. Verify the inherited
   [InputGroupInput](../../apps/app/components/ui/input-group.tsx#L125),
   [Create Site name and slug](<../../apps/app/app/[username]/(dashboard)/page.tsx#L184-L245>),
   [Page title](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PageSettings/PageSettings.tsx#L64-L71>),
   [Site name](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx#L381-L389>),
   and [CSS grid story inputs](../../apps/app/components/CSSGridBackgroundGenerator.stories.tsx).
   [Input source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/input.tsx)
2. Use the shadcn Field parts in `components/ui/field.tsx`. In the
   [dashboard Create Site dialog](<../../apps/app/app/[username]/(dashboard)/page.tsx#L184-L249>),
   convert the Name, Description, and Slug field markup. Keep the slug
   suffix and status IDs in `aria-describedby`, existing validation timing,
   and the dialog's error and pending behavior. In
   [Page Settings](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PageSettings/PageSettings.tsx#L64-L110>),
   use Field for Title and Description, a heading for the read-only Preview,
   and FieldError for the save failure at form level. [Field](https://ui.shadcn.com/docs/components/base/field)
3. In [Site Settings](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx#L199-L499>),
   replace calls to the old FieldLabel with the registry Field parts. Wire
   Cards, Brick gap, and Sticky navbar help to their controls by ID. Apply
   Field to Site name and Description. Use StudioSidebar headings and
   dividers. Use visible Bricks file inputs for Logo and both favicons,
   associate their help by ID, and place the browser chrome previews below
   the favicon inputs. Retain the narrow sidebar layout
   and form-level save error. Remove `field-label.tsx` after its last caller.
4. Replace the [Brick gap range](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx#L217-L242>)
   with the shared Bricks Base UI Slider, adapted for a single named thumb.
   Keep min 0, max 12, step 1, live pixel output, and
   the output's association with the thumb input. Put the label and help
   associations on the thumb. Replace the
   [Sticky navbar checkbox](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx#L245-L257>)
   with the same Switch used for Cards. Keep the controlled boolean.
   [Slider](https://ui.shadcn.com/docs/components/base/slider) · [Switch](https://ui.shadcn.com/docs/components/base/switch)
5. Replace the [SiteTree row checkbox](../../apps/app/components/SiteTree.tsx#L141)
   with the shadcn Base UI Checkbox from `components/ui/checkbox.tsx`. Keep
   its associated row label and boolean callback. The
   [Publish Site caller](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PublishSiteDialog.tsx#L159>)
   continues to supply checked and disabled state, including the checked,
   disabled root. Keep tree rendering and selection rules in their owners.
   [Checkbox](https://ui.shadcn.com/docs/components/base/checkbox)

```tsx
// The shared Field renders the label and help. Switch owns the toggle.
<FieldLabel htmlFor="site-sticky-navbar">Sticky navbar</FieldLabel>
<FieldDescription id="site-sticky-navbar-help">
  Keep the navbar visible while scrolling
</FieldDescription>
<Switch id="site-sticky-navbar" aria-describedby="site-sticky-navbar-help" />
```

## Verification

1. Typecheck App and build App Storybook through Nx. Use the [SiteTree Publish Selection story](../../apps/app/components/SiteTree.stories.tsx)
   to check checkbox labeling, label click, selection, and the disabled
   root. Check that shared Input retains refs, IDs, and form submission.
2. The user checks Create Site slug feedback, Page and Site settings edits,
   range keyboard steps and pixel output, the Sticky navbar switch, and
   Publish Site selection. Include file picker activation and the narrow
   sidebar. Record results and archive after verification.

`+` means create, `~` means modify, and `-` means remove.

```text
qrk.sh/
├── apps/app/
│   ├── app/[username]/
│   │   ├── (dashboard)/
│   │   │   └── ~ page.tsx
│   │   └── site/[siteId]/page/[pageId]/
│   │       ├── PageSettings/
│   │       │   └── ~ PageSettings.tsx
│   │       └── SiteSettings/
│   │           └── ~ SiteSettings.tsx
│   └── components/
│       ├── ~ SiteTree.stories.tsx
│       ├── ~ SiteTree.tsx
│       └── ui/
│           ├── + checkbox.tsx
│           ├── + field.tsx
│           ├── ~ input.tsx
│           └── - field-label.tsx
├── apps/bricks/
│   ├── ~ package.json
│   └── src/components/
│       └── ~ slider.tsx
└── wiki/plans/
    └── ~ 075-plan-app-settings-shadcn-fields.md
```

## Implementation status

App typecheck and Storybook build passed. The new SiteTree Publish Selection story passed its checked/disabled root, accessible names, and label-click selection assertions. The slider output uses Base UI Slider.Value so its htmlFor targets the actual generated thumb input.

Site Settings uses the Bricks Catalog field layout and controls for Cards,
Brick gap, Sticky navbar, Logo, and both favicons. Site Settings uses shared
StudioSidebar headings and full-width bottom borders. Site layout groups Cards, Brick
gap, and Sticky navbar. Selecting a file starts the authenticated upload.
Each successful upload updates its draft image URL and preview. Save
persists the draft URLs, and a failed upload leaves the previous preview
in place. Site identity is the first section, with Site name and wordmark
and Description first. Both use Bricks labels. The name uses Bricks Input,
Description uses Bricks TextboxInput, and form actions use Bricks Button.
Social Preview uses Bricks ImageUploadInput with a 1200 × 630 crop frame.
The image and crop are local to the open sidebar.
Site V2 declares nullable `socialPreview` with the image URL and crop.
Saving it requires a User release that binds Site V2 and its settings command.

## Remaining work

1. User verification. Check the Create Site slug feedback, Page and Site Settings fields, Brick gap keyboard and readout, Sticky navbar, Publish selection, and the narrow sidebar.
2. In Site Settings, verify the three native file pickers, favicon previews below the controls, pending Save state, upload errors and retry, and Save and Cancel after upload.
3. Archive after verification.
