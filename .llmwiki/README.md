# LLM Wiki ingest

Post-commit hook (`.llmwiki/ingest.sh`) updates `wiki/` from code diffs. **This document is the operating manual** for ingest, lint, and manual wiki edits — there is no separate schema file.

**During ingest:** Source of truth is code at `HEAD`. Modify only generated documentation under `wiki/` (the hook commits it for you). These restrictions apply to ingest, not ordinary implementation or development-document work. `wiki/dev/**` is human-authored development material and is excluded from ingest, lint, staging, and wiki commits. Produce draft reference docs, not polished product copy. Prefer `> TODO-VERIFY:` over fabricated claims.

**Before ingest:** Read `.llmwiki/config.yml` (enabled doc types, include/exclude globs) and `wiki/index.md`.

**Wiki layout:**

```
wiki/
  index.md, overview.md, glossary.md
  architecture/   ← subsystem + *Api gateway delegation docs
  user/           ← only when doc_types.user: true
  decisions/, concepts/, sources/
  dev/             ← human-authored plans, specs, handoffs, diagrams, RFCs, and archives; never ingest or lint
```

**Architecture pages (`wiki/architecture/`):** mermaid diagrams; **Trigger** (numbered `*Api` / entrypoint path); **Annotated methods** / **Annotated workflow steps** (SystemWorker → `*Repo`); **Callers**. Opening summary prose before the diagram or annotated steps should not repeat source links already carried by the numbered steps below. Citations in Trigger, Annotated, and other non-summary section prose are unordered bullets with a range-relevant fact after each working Markdown link, not parenthetical comma-separated lists. Every message arrow in a Mermaid `sequenceDiagram` must be immediately preceded by its own explicit `autonumber N` line, where `N` is that message's visible step number; do not use one global `autonumber`. Invocation arrows (`->>`) label the call site as `{receiverBinding}.{method}()` or `{receiverBinding}.{method}(...)` (for example `systemRepo.getRepoRegistrations(...)` or `gatewayApi.get*SessionApi(...)`); return arrows (`-->>`) keep result payloads; user/process steps and unnamed inline checks stay short predicates. Its `## Annotated workflow steps` section must immediately follow the diagram's closing fence, with no intervening prose, diagram, or section, and must contain one ordered-list item for every numbered message in the same order. Browser-main-thread workflows live under `wiki/architecture/browser/`; from those pages, repository source links use `../../../packages/...` or `../../../examples/...`, browser peers use `./Other.md`, and root architecture siblings use `../Other.md`. Durable sequences driven by command-chain checkpoints or Repo outboxes live under `wiki/architecture/server/`; from those pages, repository source links use `../../../packages/...` or `../../../examples/...`, server peers use `./Other.md`, root architecture siblings use `../Other.md`, and browser workflows use `../browser/Other.md`. Cross-runtime topology, singleton SystemRepo ownership, and granted Gateway capabilities remain at the `wiki/architecture/` root. Gateway docs (`AccountApi`, `AggregateSessionApi`, …) therefore stay at the root, not under `browser/` or `server/`. Links from a root page such as `wiki/architecture/Foo.md` use `../../packages/...`, `../../examples/...`, and sibling `./Other.md` — no root-absolute repository links.

**Page frontmatter** (required except `index.md`):

```yaml
---
title: ...
updated: YYYY-MM-DD
---
```

**Hard rules:**

1. Cite or do not claim — every non-trivial statement needs a source citation. Every citation or other link that includes a line number or line range must be a working Markdown link whose label includes the line numbers and whose destination uses the correct document-relative path plus Markdown line anchors, for example [`makezerospinApp.ts:26-35`](../packages/browser/src/makeRuntime/makeRuntime.ts#L26-L35). Verify that the target file and line range exist; bare text such as `(../../packages/browser/src/makeRuntime/makeRuntime.ts:26-35)` is not a link and is forbidden. Exception: on architecture pages, opening prose that only summarizes the immediately following `## Annotated workflow steps` must not repeat those step citations; put the source links on the matching numbered steps instead.
2. Every message arrow in a Mermaid `sequenceDiagram` must be immediately preceded by a separate explicit `autonumber N` line, where `N` is that message's visible step number and the numbers are contiguous from `1`; a single global `autonumber` is forbidden. Invocation arrows (`->>`) label the call site as `{receiverBinding}.{method}()` or `{receiverBinding}.{method}(...)` (for example `systemRepo.getRepoRegistrations(...)` or `gatewayApi.get*SessionApi(...)`); return arrows (`-->>`) keep result payloads; user/process steps and unnamed inline checks stay short predicates. Its `## Annotated workflow steps` section must appear immediately below the diagram's closing fence and contain exactly one ordered-list item per numbered message, with the same number, order, and meaning.
3. Never describe APIs or behavior not at HEAD.
4. No runtime/UI behavior unless tests confirm it.
5. No citations outside this repo.
6. On diff vs page conflict: `> CONTRADICTION:` blockquote + fix + note in the same source document.
7. Do not duplicate shared patterns — invoke `$patterns` and keep only Zerospin-specific guidance in [`wiki/patterns/`](../wiki/patterns/index.md).
8. Respect target-vs-current naming in [`TODOS.md`](../TODOS.md).
9. `wiki/glossary.md` uses one `## Term` ATX heading per entry; never a definition table and never HTML `<span id>` / `<a id>` anchors.
10. Inbound glossary links use markdown links with the exact heading text as the fragment (for example [`systemName`](../wiki/glossary.md#systemName)), not a lowercased GitHub slug.
11. After each `wiki/glossary.md` term's definition, list citations as unordered bullets. Each bullet is one working Markdown source citation followed by an em dash and one sentence naming the term-relevant fact at that range. Do not comma-separate citations. Do not restate the definition.
12. On `wiki/architecture/**` pages, list every source citation as an unordered bullet; these bullets satisfy the claim's citation requirement instead of a trailing parenthetical link list. Each bullet is one working Markdown source citation followed by an em dash and one sentence naming the range-relevant fact at that range — the call, check, or return that range uniquely performs. Do not comma-separate citations. Do not restate the parent paragraph or numbered step. Nested bullets under Trigger and Annotated numbered items follow the same shape.

**Ingest output:** Update affected generated pages outside `wiki/dev/**`; create pages for new public surface when doc type enabled; refresh glossary/index/overview when warranted. Do not commit — hook does `wiki: update (<sha>)`.

Manual architecture edits: use [update-architecture](https://github.com/morgs32/wip/blob/main/skills/update-architecture/SKILL.md).
