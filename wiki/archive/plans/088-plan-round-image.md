# 088 · Round Image Brick

1. Add Round Image to the drawer's Images row. It starts with Round checked and an empty source and alt text. The Image module supplies the initial draft, and the preset uses the existing captionless Placement spec.
2. Add Round to the Image form. Caption stays visible and is disabled while Round is checked. Round is disabled while Caption contains nonwhitespace text.
3. Save Round on the shared Brick. Older Image state defaults to rectangular. Render the largest centered circle that fits each Placement, and open the crop editor with a square frame. Turning Round off restores the rectangular image and allows captions, including for a Brick created from the Round Image preset.
4. Register User V20 with Add Brick V13 and Update Brick V14. Both use the Image V4 schema. Share the command callbacks with prior releases, which keep their original schema. Reverse adapters refuse round commands and remove the Round field from rectangular commands. Bind the App session to V20 and preserve all existing registry entries and canonical selections.

```ts
// A preset draft still needs a source and alt text before it can be placed.
{ imageUrl: "", altText: "", caption: "", crop: null, round: true }

// A blank caption allows Round. The shared crop is applied in a square frame.
{ imageUrl: "/lake.jpg", altText: "Mountain lake", caption: "  ", crop: { x: 0.6, y: 0.5, zoom: 1.4 }, round: true }
```

## Files

`+` adds a file or group. `~` updates existing files.

```text
qrk.sh/
├── apps/
│   ├── app/       ~ drawer, App session binding, scripted story, and module docs
│   ├── bricks/    + Image V4
│   │              ~ Image form, renderer, and preview metadata
│   └── zerospin/  + versioned commands and User V20
│                  ~ shared command callbacks, registry, and focused checks
└── wiki/
    ├── archive/plans/088-plan-round-image.md  + implementation record
    └── glossary.md                           ~ Round Image
```

## Verification

1. All 44 Zerospin tests passed. The Brick command checks covered round creation, a rectangular update from an older payload, caption rejection on both commands, preservation of Placement specs, and reverse adaptation.
2. The App build and both Storybook builds passed. App and Bricks TypeScript checks passed.
3. The user owns the manual pass for the drawer preset, both disabled controls, square crop framing, and circular rendering in wide and tall Placements. The scripted Storybook interaction was compiled. Live V20 synchronization and retained-history rollout were outside this verification.

## Remaining work

None.
