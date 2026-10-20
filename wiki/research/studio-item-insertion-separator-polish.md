# Polishing Studio's item insertion separator

Researched 2026-10-20. Research only: recommendations below are visual judgments, not implemented or visually verified results.

## Current constraints and source findings

The story-local `ItemInsertionSeparator` is a real Button with a 16px interaction band, two 1px rules tangent to a hollow 12px circle, an 8px Plus, and violet hover/focus color. It reveals on hover or keyboard focus and has no background fill. Preserve that geometry and interaction when considering decoration. [Current story](../../apps/app/components/PragmaticTree.stories.tsx).

[Zil Norvilis's article](https://norvilis.com/stop-making-ugly-apps-simple-tailwind-tricks-for-backend-developers/) recommends restrained borders and small shadows for cards, light gray canvas contrast, quieter secondary actions, and translucent focus rings for inputs. Those are the author's visual heuristics. The article does not establish that an insertion divider needs a shadow; its filled cards and buttons are different surfaces from this hollow control.

Official shadcn source keeps the [Separator](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/separator.tsx) as a flat `h-px`/`bg-border` rule. Its [ghost Button](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button.tsx) has no shadow and retains visible focus styling. Neither source prohibits adding shadows.

Tailwind supports element [opacity](https://tailwindcss.com/docs/opacity), targeted [transition properties](https://tailwindcss.com/docs/transition-property) and [durations](https://tailwindcss.com/docs/transition-duration), arbitrary gradient [masks](https://tailwindcss.com/docs/mask-image), and custom [box shadows](https://tailwindcss.com/docs/box-shadow). These establish implementation capabilities; they do not establish which treatment looks best here.

## Restrained treatments

1. **Quieter arms, crisp center — recommended.** Keep the circle and Plus fully opaque, but give each line arm roughly 55–65% opacity. Reveal with a short 120–150ms opacity/color transition. This puts emphasis on the action without making the whole width equally loud. Keep the lines 1px, circle unfilled, violet color, and existing focus indication. The percentages and timing are proposed design values.
2. **Feather only the outer ends.** Alternatively, fade the outermost 12–16px of each arm while leaving the center junction opaque. This can soften the hard termination at a stack edge without changing the connected circle geometry. Mask only the line arms, never the Button or its focus indicator. Tailwind's arbitrary mask utility can express the gradient. [Mask documentation](https://tailwindcss.com/docs/mask-image).
3. **A tiny center-only shadow, if depth is wanted.** Apply at most `0 1px 2px rgb(0 0 0 / 0.05)` to the circle alone; this is Tailwind's documented `shadow-xs` default. Keep the arms flat and the circle transparent. My judgment is that this offers less benefit than color hierarchy at a 12px scale, so it should be an alternative rather than another layer on top. [Shadow values](https://tailwindcss.com/docs/box-shadow).

Illustrative CSS for treatments 1 and 2, not applied code:

```css
/* 1. Recommended: hierarchy without extra surfaces. */
.insertion-control { transition: opacity 140ms ease, color 140ms ease; }
.insertion-arm { opacity: 0.6; }

/* 2. Alternative: fade only each arm's outer endpoint. */
.insertion-arm-left { mask-image: linear-gradient(to right, transparent, black 12px); }
.insertion-arm-right { mask-image: linear-gradient(to left, transparent, black 12px); }
```

These examples use the documented opacity/transition/mask capabilities linked above. Start with treatment 1 alone. A filled pill, a full-width blur, and a permanent glow would add surfaces or emphasis beyond the current requested control; that assessment is a design recommendation.

## Execution boundary

Only this research note was added. No UI changes, dependencies, tests, builds, checks, or local browser verification were performed.
