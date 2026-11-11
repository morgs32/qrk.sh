# 064 · Non-destructive Image Brick cropping

1. Keep the original source URL, title, and a shared normalized focal point and zoom in Image Brick state. Measure the active Placement image frame for the editor and use the default Image Cover proportions when it has no measurable frame.
2. Keep Upload, Paste from URL, and Crop in the image dialog. Start replacement sources centered at 1×. Apply uploads an original local file and stages the URL and crop in the form. Save commits the Brick. Cancel discards the current draft.
3. Add Image V2 and a candidate User release with `updateBrick@6`. Existing state decodes as uncropped. Existing specs keep their position until a crop is set, and recover it on reset. Preserve current canonical selections and registrations.
4. Verify the dialog, crop rendering, and candidate save. Reconcile the glossary and evaluate ADR criteria after implementation.

```ts
// Placement dimensions change the cover size. All four Placements share this framing.
{ imageUrl: "https://example.com/photo.jpg", title: "Mountain trail",
  crop: { x: 0.62, y: 0.41, zoom: 1.4 } }
```

## Files

`+` adds a file. `~` updates an existing file or group.

```text
qrk.sh/
├── apps/bricks/
│   ├── + src/react/CroppedImage.tsx
│   ├── + src/image/definition/imageV2.ts
│   ├── ~ src/react/ImageUploadInput.tsx
│   └── ~ Image form, renderer, and Storybook wiring
├── apps/app/
│   └── ~ BrickDetail and userSessionDefinition.ts
├── apps/zerospin/
│   ├── + UpdateBrickV6, UserV11, userActorV11, and imageCrop.spec.ts
│   └── ~ src/system.ts
└── wiki/
    ├── + plans/064-plan-image-brick-crop.md
    └── ~ glossary.md
```

## Verification

1. App and both Storybooks built. The later Bricks TypeScript check reports a type error in the concurrent `StudioSidebar.stories.tsx` work. The Zerospin suite passed all 22 tests, including older Image state, a saved crop on the candidate release, out-of-range crop rejection, and preservation of Placement specs.
2. Headless Storybook verification covered the active frame proportions, original file upload on Apply, upload failure and retry, dialog Cancel, Paste from URL, Brick Save, crop rendering at all four widths, and restoring a non-center spec position after clearing the crop.
3. Added Image crop to the glossary. The existing Wall and Brick ownership decisions cover this additive Image field.

## Remaining work

1. The user owns the manual browser pass. Archive this plan when that pass is complete.
2. Canonical selection remains at User V9. Promotion is a separate handwritten step.
