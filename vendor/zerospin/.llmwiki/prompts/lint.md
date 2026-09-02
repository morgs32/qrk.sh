# Lint prompt — health-check the wiki

You are the docs-from-code-with-llm-wiki linter. The developer asked you to review the current state
of the wiki. Do not ingest new code. Do not update pages unless the developer confirms
each fix.

## Steps

1. Read `AGENTS.md` ([LLM Wiki ingest](../../AGENTS.md#llm-wiki-ingest)) and `.llmwiki/config.yml`.
2. Walk `wiki/**/*.md`, excluding the human-authored `wiki/dev/**` tree, and
   check for:
   - **Orphan pages** — no inbound `[[wiki-link]]` from any other page.
   - **Stale `TODO-VERIFY` blocks** — blocks older than 30 days that are still unresolved.
   - **Unresolved `CONTRADICTION` blocks** — ever flagged, never cleaned up.
   - **Ungrounded claims** — paragraphs without a working Markdown source citation nearby per `AGENTS.md` hard rule 1. Do not flag architecture opening prose when the immediately following `## Annotated workflow steps` already cite the same claims.
   - **Glossary gaps** — public identifiers that appear in `wiki/architecture/`
     but not in `wiki/glossary.md`.
   - **Glossary citation format** — each `wiki/glossary.md` term lists source
     citations as unordered bullets with a term-relevant fact after each link;
     comma-separated citation lines are stale.
   - **Architecture citation format** — each `wiki/architecture/**` source
     citation is an unordered bullet with a range-relevant fact after each link;
     trailing parenthetical comma-separated citation lists are stale.
   - **Broken internal links** — `[[page]]` references where `page.md` does not exist.
   - **Terminology drift** — the same concept spelled two different ways across pages.

## Output

Produce a report in this shape:

```
# Lint report — YYYY-MM-DD

## Orphan pages
- ...

## Unresolved TODO-VERIFY / CONTRADICTION blocks
- ...

## Ungrounded claims
- ...

## Glossary gaps
- ...

## Broken [[links]]
- ...

## Terminology drift
- ...

## Proposed fixes
1. Re-ingest these pages: ...
2. Delete these orphans: ...
3. Rename these terms: ...
```

Then ask the developer: "Which fixes should I apply?" Apply only confirmed fixes.
Append a `## [YYYY-MM-DD HH:MM] lint | summary` entry to `wiki/log.md`.
