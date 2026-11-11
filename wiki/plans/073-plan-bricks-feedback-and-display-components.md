# Plan 073 — Adopt shadcn feedback and display components in Bricks

Use registry parts for the avatar fallback, alerts, and small presentation
controls identified by the audit. Keep the editor, provider data, and
module layout behavior at their existing call sites.
[Adoption audit](../research/shadcn-component-adoption-audit.md#bricks)

## Implementation and call sites

1. Adopt shadcn Avatar, AvatarImage, and AvatarFallback in `react/avatar.tsx`.
   Replace the manual error and missing-image branches at
   [GitHub Profile AvatarAndUsername](../../apps/bricks/src/modules/githubProfile/react/GitHubProfile/components/AvatarAndUsername.tsx#L11-L23).
   Keep the 32px crop, `login` alternate text, initials from the first two
   login characters, and adjacent visible handle. Use the provider URL
   for the registry image and verify that missing and failing URLs show
   the fallback. [Avatar](https://ui.shadcn.com/docs/components/base/avatar)
2. Use the registry Alert parts in `react/alert.tsx` for
   [Article save failure](../../apps/bricks/src/modules/article/react/ArticleEditor.tsx#L209-L235)
   and [spec generation failure](../../apps/bricks/.storybook/BrickStory.tsx#L238-L244).
   Retain a single live error announcement and the Article's existing
   Retry and dismiss controls. Leave its borderless title and subtitle
   textareas with the document editor. [Alert](https://ui.shadcn.com/docs/components/base/alert)
3. Replace the native [Cards checkbox](../../apps/bricks/.storybook/BrickStory.tsx#L86-L89)
   with the shadcn Base UI Checkbox from `react/checkbox.tsx`. Keep the
   visible and accessible name, label click, controlled boolean, and
   existing preview toggle. [Checkbox](https://ui.shadcn.com/docs/components/base/checkbox)
4. Use the registry Spinner from `react/spinner.tsx` at
   [Map Place](../../apps/bricks/src/modules/mapPlace/react/GooglePlaceLookup.tsx#L208)
   and [icon search](../../apps/bricks/src/modules/swatchAndIcon/react/MaterialSymbolsIconLookup.tsx#L76)
   and [Load more](../../apps/bricks/src/modules/swatchAndIcon/react/MaterialSymbolsIconLookup.tsx#L150)
   loading indicators. Keep the spinner decorative wherever text already
   announces progress. Keep its size and the surrounding controls.
   [Spinner](https://ui.shadcn.com/docs/components/base/spinner)
5. Use the registry Separator from `react/separator.tsx` at
   [StudioSidebar](../../apps/bricks/src/components/StudioSidebar.tsx#L45),
   [SwatchPopover](../../apps/bricks/src/components/SwatchPopover.tsx#L30),
   and [RadiusInput](../../apps/bricks/src/components/RadiusInput.tsx#L57).
   Keep the existing thin divider and color. Use shadcn Empty from
   `components/empty.tsx` for the [no saved content status](../../apps/bricks/src/modules/react/makeModuleView.tsx#L151),
   with the existing copy, status role and compact layout. Use local
   padding and border overrides so it fits in the Brick's allotted space.
   [Separator](https://ui.shadcn.com/docs/components/base/separator) · [Empty](https://ui.shadcn.com/docs/components/base/empty)

```tsx
// The avatar primitive owns the image-to-initials fallback.
<Avatar className="size-8">
  <AvatarImage src={avatarSrc || undefined} alt={login} />
  <AvatarFallback>{login.slice(0, 2).toUpperCase()}</AvatarFallback>
</Avatar>
```

## Verification

1. Run the Bricks Storybook build/import check, Bricks typecheck, and
   existing scripted Place Search and Icon Selection stories.
2. The user checks GitHub Profile image and fallback, Article retry and
   dismiss, the Cards toggle, spec failure, and the compact loading and
   empty states. Record results and archive after verification.

`+` means create and `~` means modify.

```text
qrk.sh/
├── apps/bricks/
│   ├── .storybook/
│   │   └── ~ BrickStory.tsx
│   └── src/
│       ├── modules/article/react/
│       │   └── ~ ArticleEditor.tsx
│       ├── modules/githubProfile/react/GitHubProfile/components/
│       │   └── ~ AvatarAndUsername.tsx
│       ├── modules/mapPlace/react/
│       │   └── ~ GooglePlaceLookup.tsx
│       ├── modules/swatchAndIcon/react/
│       │   └── ~ MaterialSymbolsIconLookup.tsx
│       ├── modules/react/
│       │   └── ~ makeModuleView.tsx
│       └── components/
│           ├── + alert.tsx
│           ├── + avatar.tsx
│           ├── + checkbox.tsx
│           ├── + empty.tsx
│           ├── + separator.tsx
│           ├── + spinner.tsx
│           ├── ~ RadiusInput.tsx
│           ├── ~ StudioSidebar.tsx
│           └── ~ SwatchPopover.tsx
└── wiki/plans/
    └── ~ 073-plan-bricks-feedback-and-display-components.md
```

## Implementation status

Bricks typecheck and Storybook build/import check passed. Scripted Place Search and Icon Selection passed. The current Material Symbols catalog flow has one loading indicator. Load more is synchronous in this checkout.

## Remaining work

1. User verification. Check GitHub Profile avatar and fallback, Article feedback actions, the Cards checkbox, spec failure, loading indicators, dividers, and the compact empty state.
2. Archive after verification.
