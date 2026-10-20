# Section insertion divider

Researched 2026-10-20 against official shadcn documentation/source and the current local UI primitives. This note distinguishes source facts from the visual recommendation; it does not claim visual verification.

## Source facts

- **Separator** is shadcn's general divider primitive. Its current source renders a horizontal `h-px` line with `bg-border`, defaults to decorative semantics, and specifies no shadow. [Documentation](https://ui.shadcn.com/docs/components/radix/separator), [official source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/separator.tsx).
- **FieldSeparator** supports centered children over a line. Its implementation layers a `Separator` underneath a centered content span with `bg-background`; the Field family is intended for composing forms. It supplies the visual pattern, but its background masking and form spacing are unnecessary for this Studio control. [Field documentation](https://ui.shadcn.com/docs/components/radix/field), [FieldSeparator source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/field.tsx#L145-L173).
- **Marker** also has a separator variant with centered content and lines on either side. Its documented purpose is conversation markers and section breaks in conversations, rather than an editor's insertion control. Interactive markers must render a real button or link. [Marker variants and accessibility](https://ui.shadcn.com/docs/components/radix/marker).
- QRK already has the same flat, token-colored [Separator](../../apps/app/components/ui/separator.tsx). Its existing [Button](../../apps/app/components/ui/button.tsx) has a shadow-free ghost variant with hover styling and a visible keyboard focus ring. The official Button source likewise keeps ghost flat while its outline variant includes `shadow-xs`. [Official Button source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button.tsx).

## Recommendation for Studio

Compose two decorative local Separators around one small local ghost Button with a Plus icon. Use `bg-border` for the lines and `text-muted-foreground` for the icon, so the control follows the existing shadcn theme. Keep the button at 24px with a 14px icon and accessible name **Add section**; preserve the Button's hover and focus treatments.

**Keep the line and button shadow-free.** This is a design judgment: a crisp 1px rule communicates an insertion boundary within the gray canvas; a shadow would suggest an elevated surface. The shadcn sources support the flat treatment, but they do not prohibit shadows. If elevation later becomes desirable, restrict it to the button rather than blurring the divider.

Use this treatment between sections and retain the distinct full-width pill at the bottom. Existing primitives cover the interaction without installing Field or Marker or introducing a wrapper component.

## Verification

Research and source reading only. No tests, builds, browser inspection, or automated checks were run.
