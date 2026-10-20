# Article body spacing: Tailwind and shadcn

Researched 2026-10-20 against official documentation/source and the running Library `/modules` Article preview. This records findings and a recommendation; no Article styles or dependencies were changed.

## Current QRK spacing

At a 1476 × 1314 viewport with a 360px-wide catalog Article, live computed styles and element bounds show:

| Boundary | Measured spacing | Owner |
| --- | --- | --- |
| Article top and bottom | 16px each | Shared responsive document insets |
| Subtitle to body | 36px | Subtitle bottom margin |
| Body first/last edges | 0 additional margin or padding | Meowdown body and boundary blocks |
| Between body blocks | 16.15px (`0.85em` at 19px) | Body block top margins |

The body uses 19px text with a 30.4px line height. The first paragraph has no margins; the final paragraph has a 16.15px top margin and no bottom margin. The measured bottom inset is therefore already 16px, rather than padding plus an untrimmed paragraph margin. The visible difference is the 36px subtitle/body separation versus the 16px exterior inset. Sources: [Article markup](/Users/morgs32/GitHub/qrk.sh/apps/library/modules/article/ArticleBrickContent.tsx:47), [subtitle and body CSS](/Users/morgs32/GitHub/qrk.sh/apps/library/modules/article/article-editor.css:164), and live browser measurements on the date above.

QRK's shared responsive inset changes from 16px to 32px at the wider breakpoint; that outer layout rule is separate from article typography. [Shared insets](/Users/morgs32/GitHub/qrk.sh/apps/library/bricks.css:25)

## Tailwind defaults

Tailwind Preflight removes default element margins and padding; ordinary Tailwind alone does not supply article rhythm. [`Preflight`](https://tailwindcss.com/docs/preflight#margins-are-removed)

The optional Typography plugin styles rendered HTML through `prose`. Its base scale uses:

| Element | Default |
| --- | --- |
| Body | 16px type, 1.75 line height |
| Paragraphs and `ol`/`ul` | 1.25em top/bottom margins (20px at base size) |
| List items | 0.5em top/bottom margins (8px) |
| `.lead` paragraph | 20px type, 1.6 line height, 24px top/bottom margins |
| Direct first/last child | First top margin and last bottom margin reset to zero |

These are block margins; the plugin does not establish the article's exterior padding. Its `.lead` styling is opt-in and is not a general subtitle contract. List rules target semantic `ol`, `ul`, and `li`; Meowdown's flat-list `div` structure needs separate consideration. [Typography source](https://github.com/tailwindlabs/tailwindcss-typography/blob/main/src/styles.js)

`prose` also supplies a maximum width, which can be overridden with `max-w-none`. Adding the plugin would change more than the two spacing boundaries under review. [Typography documentation](https://github.com/tailwindlabs/tailwindcss-typography#overriding-max-width)

## Current shadcn guidance

The former [Typography URL](https://ui.shadcn.com/docs/components/typography) now redirects to [Typeset](https://ui.shadcn.com/docs/typeset). Current guidance supplies an optional CSS file owned by the application, activated through a `typeset` wrapper. It is a real styling system rather than an automatic default attached to every shadcn application.

Its documented defaults are `--typeset-size: 1em`, `--typeset-leading: 1.75`, and `--typeset-flow: 1.25em`. Flow controls spacing between blocks. Layout owns maximum width. Typeset uses `margin-block-start` for spacing and avoids `:last-child` layout rules so appending streamed content does not restyle earlier blocks. These defaults become relevant after deliberately adopting its stylesheet and wrapper; they do not describe QRK's current Article. [Typeset defaults and layout](https://ui.shadcn.com/docs/typeset#custom-typesets), [streaming rules](https://ui.shadcn.com/docs/typeset#streaming)

## Recommendation

Adjust the existing Article subtitle/body gap explicitly; **24px is a reasonable first preview**, informed by Tailwind's lead spacing and the need to distinguish subtitle separation from ordinary body flow. Retain the existing shared exterior insets of 16px/32px and the already-trimmed body edges. That is a QRK design judgment, not a mandated upstream default.

Use the same subtitle/body separation in reading and editing views. Avoid importing another typography system merely to fix this gap: QRK already has body rhythm, and Meowdown's custom list DOM plus its existing CSS would need broader review before adopting `prose` or `typeset`. No styling change is included in this research note.
