# Compact drawer headers

Researched 2026-11-05 against official shadcn/ui source and Tailwind CSS documentation. Scope: reduce the editor drawers' header height and typography without changing drawer behavior.

## Upstream conventions

The shadcn Radix-style `DrawerHeader` uses a vertical flex layout, `p-4`, and responsive gap/alignment classes. `DrawerTitle` adds weight and color, without an explicit font size. Neither fixes a header height. These are shipped defaults, not a requirement that QRK keep 16px vertical padding. [Drawer source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/drawer.tsx).

The corresponding `SheetHeader` also uses a vertical flex layout with `gap-1.5 p-4`; `SheetTitle` supplies weight and color. Its close control has an accessible hidden label and focus styling. This demonstrates the separation between header layout and close-control semantics; changing spacing need not change the control behavior. [Sheet source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/sheet.tsx).

Tailwind's `h-<number>` utilities multiply the spacing variable. The default spacing unit is `0.25rem`, so `h-14`, `h-12`, and `h-10` correspond to 56px, 48px, and 40px at a 16px root size. These are theme-dependent values, not hard-coded guarantees. [Height documentation](https://tailwindcss.com/docs/height), [default theme source](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/theme.css).

Tailwind's default `text-sm` is `0.875rem` with a `1.25rem` line height (14px/20px at a 16px root), compared with `text-base` at 16px/24px. Using the size utility supplies a coherent line height without an additional custom value. [Font-size documentation](https://tailwindcss.com/docs/font-size).

## QRK recommendation

Use `h-12` and `text-sm` for the existing shared editor drawer header. This is a QRK design recommendation, not a shadcn-prescribed height. It reduces the current 56px header by 8px and preserves room around the existing 40px close button; `h-10` would fit that button flush vertically. Apply typography consistently to the breadcrumbs and settings heading. Keep the existing close target, accessible name, keyboard behavior, and focus styling. [Current shared layout](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/(drawer)/layout.tsx), [current shared header](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/(drawer)/DrawerHeader.tsx).

Use ordinary Tailwind utilities on the current shared components. No new component, spacing token, dependency, or replacement shadcn drawer is needed for this bounded adjustment; that scope recommendation follows from the existing shared layout and header linked above.
