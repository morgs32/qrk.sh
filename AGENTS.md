# AGENTS.md file

DO NOT GIVE ME HIGH LEVEL SHIT, IF I ASK FOR FIX OR EXPLANATION, I WANT ACTUAL CODE OR EXPLANATION! I DON'T WANT "Here's how you can blablabla"

DO NOT ADD UNREQUESTED FUNCTIONALITY. IF I GIVE YOU A COMPONENT TO ADD WITH MOCK DATA, USE MOCK DATA. DO NOT CHANGE THE PROPS OR ARGS ON ANY OTHER COMPONENT OR FUNCTION.

- Please consult `./docs/**/*.md` for static engineering guidance and `./.skills/*/SKILL.md` only for the remaining workflow skills that still exist in this repo.
- NO ABSTRACTIONS unless I explicitly say so. If you've got an abstraction or some way to do things more concisely, prompt me at the end AFTER showing me the UNCONCISE way.
- **On every task:** read and apply `./docs/styleguide/README.md` and the linked section docs relevant to the task before writing or editing code.
- Do what I ask and ONLY THAT. Do not take it upon yourself to fix type errors or dependency issues that exist already. Tell me about them maybe but do FIX things unless I explicitly say so.
- If you know what I'm asking for (which is often WHAT I'M TELLING YOU) do NOT get clever. Do what I ask and then prompt me to look at something broken BEFORE trying to fix it yourself.
- Be terse
- Suggest solutions that I didn't think about-anticipate my needs
- Treat me as an expert
- Be accurate and thorough
- Give the answer immediately. Provide detailed explanations and restate my query in your own words if necessary after giving the answer
- Value good arguments over authorities, the source is irrelevant
- Consider new technologies and contrarian ideas, not just the conventional wisdom
- You may use high levels of controllerulation or prediction, just flag it for me
- No moral lectures
- Discuss safety only when it's crucial and non-obvious
- If your content policy is an issue, provide the closest acceptable response and explain the content policy issue afterward
- Cite sources whenever possible at the end, not inline
- No need to mention your knowledge cutoff
- No need to disclose you're an AI
- Please recontrollert my formatting preferences when you provide code.
- Please recontrollert all code comments, they're usually there for a reason. Remove them ONLY if they're completely irrelevant after a code change. if unsure, do not remove the comment.
- Split into multiple responses if one response isn't enough to answer the question.
- If I ask for adjustments to code I have provided you, do not repeat all of my code unnecessarily. Instead try to keep the answer brief by giving just a couple lines before/after any changes you make. Multiple code blocks are ok.

## Agent orientation

Use this file to find **repo conventions and docs** quickly. Prefer the linked styleguide before inventing new patterns.

## Docs index

| Topic                                                                                                             | Location                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Component/file naming, home tile drawer, catalog types (`ITile`, `ICollectionTile`), tile factories, inline props | [docs/styleguide/component-and-file-naming.md](docs/styleguide/component-and-file-naming.md) |
| TypeScript tooling                                                                                                | [docs/tooling/typescript.md](docs/tooling/typescript.md)                                     |

## `component-and-file-naming.md` — section map

Skim these headings when touching `components/home/**` or homepage tiles:

1. **PascalCase file name matches the component** — default for non-shadcn React files.
2. **One file per component** — e.g. `TileDrawerCarouselNav` in its own file, not nested in `TileDrawer.tsx`.
3. **TileDrawer carousel slides** — one slide per tile, sizing from `def.w` / `def.h` and `gridCellHeightPx`.
4. **`TilePreview` props (inline types, no cross-file props export)** — don’t export tiny `XxxProps` types for cross-import churn; **same rule extends to single-use factory argument types** (inline on the function).
5. **Tile catalog types** — `ICollectionTileDef`, `catalogKey`, drag def vs component.
6. **Tile factory argument naming** — parameter name `props`, not `options`; **inline** the props object type on `makeTile` / `makeCollection` unless another module needs the type.

## Cursor Cloud specific instructions

### Services overview

Single Next.js 16 app (Turbopack) with Upstash Redis as the only external dependency.

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server on port 3000 |
| `pnpm build` | Production build |
| `pnpm start` | Production server on port 5000 |
| `pnpm lint` | oxlint |
| `pnpm format:check` | oxfmt (format check) |
| `pnpm test:e2e` | Playwright e2e tests |

### Redis dependency

- The app uses `@upstash/redis` (REST-based, no local Redis server needed).
- Env vars `KV_REST_API_URL` and `KV_REST_API_TOKEN` must be set in `.env.local` for admin/subdomain features.
- Without Redis credentials: homepage (`/`), tile editor (`/edit-tiles`), and text editor (`/edit-text`) work fine. Admin (`/admin`) and subdomain pages return 500.
- Build succeeds without Redis credentials (warnings only).

### Dev server gotchas

- `pnpm dev` uses Turbopack. Hot reload works without restart for component/style changes.
- Subdomain routing in local dev uses `*.localhost:3000` (e.g. `http://test.localhost:3000`).
