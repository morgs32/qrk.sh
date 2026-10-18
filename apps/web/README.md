# Web

Run `pnpm nx run @qrk.sh/web:storybook` from the workspace root to browse the web
link styles at <http://127.0.0.1:6008>.

- **Web / Links / Dashboard** shows the orange Silkscreen link.
- **Docs** shows each link example with a copyable JSX snippet expanded below it.
  Individual stories also have a **Code** panel.
- **Web / Button Links** shows every button variant rendered as a link, plus
  the available sizes.
- **Web / Underlined Link** shows the reusable `UnderlinedLink` in `sm` (12px,
  default) and `lg` (16px) sizes. The home footer uses `sm`; Login uses `lg`.
- **Web / Wordmark** shows the shared Silkscreen home link used on the home,
  Privacy, and Terms pages. Next.js supplies its font through the root layout;
  Storybook supplies the same font through its preview styles.
- **Web / Ordered Body** replaces the former `/ordered-body` demo route with
  nested documentation content and controls for list decorators and permalinks.
- **Web / Outline Links** shows outline navigation, including muted entries.

The home page's colocated `page.stories.tsx` previews Dashboard without mounting
authentication. Shared components have their own stories.

Web's Oxlint configuration in `vite.config.mts` restricts `next/link` imports to
`components/Wordmark.tsx` and `components/UnderlinedLink.tsx`. Use those components
for navigation. Run `pnpm exec vp lint .` from `apps/web` to apply the rule.

Use `pnpm nx run @qrk.sh/web:build-storybook` to produce a static Storybook.
