# Publish Site as accent-colored text

Researched 2026-10-29. Scope: the Publish Site trigger in the floating Page
controls toolbar. Research only; no application styling or publication behavior
was changed.

## Recommendation

Use the existing shadcn `Button` with `variant="link"` and a local chromatic text
color. This directly matches the requested text-only treatment: no filled box,
with an underline on hover. Keep `type="button"` inside `DialogTrigger asChild`;
the action opens a dialog, so it should retain button semantics.
This is a design recommendation based on the existing implementation, not a
shadcn rule that all dialog triggers must use this variant.
[shadcn Radix Button](https://ui.shadcn.com/docs/components/radix/button#link),
[local variants](../../apps/app/components/ui/button.tsx#L18),
[current trigger](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/%28drawer%29/PublishSiteDialog.tsx#L96).

Proposed change at that trigger only:

```tsx
<Button type="button" variant="link" size="sm" className="text-blue-600 dark:text-blue-400">
  Publish Site
</Button>
```

Blue is a proposed emphasis color, not an established QRK brand token. The same
light/dark text utilities are already used by the search preview link. No new
button variant, dependency, wrapper, or global theme change is needed for this
proposal.
[existing colored link](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/SearchPreviewCard.tsx#L31),
[Button class composition](../../apps/app/components/ui/button.tsx#L50).

## Link versus ghost

- `link` supplies `text-primary` and an underline on hover, with no filled surface.
  Adding a local text color gives the requested colored text treatment.
- `ghost` is transparent at rest but adds `bg-accent` and
  `text-accent-foreground` on hover. It suits toolbar actions with a hover tile,
  but a chromatic ghost treatment also needs a hover text override to keep its
  color. It is a reasonable alternative if that hover tile is preferred.

These are the actual styles in QRK and the current upstream shadcn Radix source.
The variant changes styling; QRK still renders a native button unless `asChild`
is requested.
[local Button](../../apps/app/components/ui/button.tsx#L7),
[upstream Button source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button.tsx).

## What “accent” means here

shadcn's `accent` token is an interactive hover/active surface, paired with
`accent-foreground` for its text. `primary` is the high-emphasis action token.
Consequently, `text-accent` does not inherently mean colorful emphasis text.
[official theme token definitions](https://ui.shadcn.com/docs/theming#theme-tokens).

QRK currently uses a neutral palette:

- Light `primary`: `oklch(0.21 0.006 285.885)` (near black).
- Light `accent`: `oklch(0.967 0.001 286.375)` (pale gray).
- Dark `primary`: `oklch(0.92 0.004 286.32)` (light gray).
- Dark `accent`: `oklch(0.274 0.006 286.033)` (dark gray).

A plain `variant="link"` would therefore remain near-black text in the light
theme. `text-accent` would instead select the pale surface color. Changing the
global `primary` or `accent` tokens would affect other consumers of those tokens;
a local color is the bounded choice for the single selected action.
[light tokens](../../apps/app/app/globals.css#L64),
[dark tokens](../../apps/app/app/globals.css#L98),
[token mapping](../../apps/app/app/globals.css#L38),
[shadcn theming](https://ui.shadcn.com/docs/theming).

## Scope and verification

`SiteToolbar` mounts this dialog trigger while the site is unpublished. The
actual publish command is submitted by a separate filled button inside the
dialog. Apply any future styling change to the trigger, keeping the dialog's
confirmation action and publishing handler intact.
[toolbar call site](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/Toolbars/SiteToolbar.tsx#L123),
[confirmation button](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/%28drawer%29/PublishSiteDialog.tsx#L157).

The findings were checked against official docs, upstream source, and the local
source files. No browser prototype, visual acceptance, contrast measurement, or
publication was performed. If implemented, verify the resting, hover, and
keyboard-focus appearance and that the trigger still opens the existing dialog.
