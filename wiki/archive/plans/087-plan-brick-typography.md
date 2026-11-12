# Plan 087 — Match Brick typography to QRK

1. Let Article titles, subtitles, and their input placeholders inherit Geist
   from the shared QRK theme, as other Brick prose does.
2. Keep Spectral and its font imports for editable and read-only Article
   bodies. Preserve the existing type scale and Geist Mono roles. Spotify and
   YouTube control typography inside their embedded players.
3. Document the convention in the Brick layout guide.

```css
.qrk-article-readonly,
.qrk-article-writing-column {
  /* Titles, subtitles, and their inputs inherit the shared Geist font. */
}

.qrk-article-editor {
  /* The editable and read-only Article body use Spectral. */
  font-family: "Spectral", Georgia, serif;
}
```

`+` creates a file. `~` updates a file.

```text
qrk.sh/
├── apps/bricks/src/modules/article/react/
│   └── ~ article-editor.css
└── wiki/
    ├── ~ brick-layout-conventions.md
    └── plans/
        └── + 087-plan-brick-typography.md
```

## Verification

1. Run the Bricks `build-storybook` target through Nx and `git diff --check`.
2. The user checks Article Breakpoint Previews, Studio Editor, and a published
   Article for Geist titles and subtitles and Spectral bodies. Check placeholder
   typography in the empty editor and wrapping at a narrow breakpoint.

## Implementation and verification

1. Removed the Article wrapper’s font override in the [Article stylesheet](../../../apps/bricks/src/modules/article/react/article-editor.css)
   and recorded the convention in the [Brick layout guide](../../brick-layout-conventions.md).
2. The Nx Bricks Storybook build, its import check, and `git diff --check` passed.
   The user performs the manual checks on their own time.

## Remaining work

None.
