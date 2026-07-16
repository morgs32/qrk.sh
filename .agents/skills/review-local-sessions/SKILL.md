---
name: review-local-sessions
description: Scan local Cursor Agent and Codex transcript JSONL for recurring friction, doc-update requests, and skill gaps; output evidence-backed skill recommendations.
---

# Review local sessions

Use this skill when reviewing **local agent chat history** (Cursor Agent and Codex) to find patterns worth encoding as **new or deepened agent skills** — not generic coaching.

## When to use

- A scheduled or manual **Cursor Automation** (or Codex cron automation) asks for a session review.
- The user wants skill suggestions grounded in **their actual chats**, not best-practice boilerplate.
- After a busy week of agent work and you need a prioritized skill backlog.

## Session sources

Scan **both** Cursor Agent and Codex. Merge findings into one report; tag each evidence line with its source.

### Cursor Agent

```
~/.cursor/projects/<project-slug>/agent-transcripts/<session-uuid>/<session-uuid>.jsonl
```

Subagent transcripts may appear under `.../subagents/*.jsonl` — include them when the parent session topic matches.

For this repo, the primary slug is usually:

```
~/.cursor/projects/Users-morgs32-GitHub-zerospin/agent-transcripts/
```

If the automation runs in another repo, derive the slug from that workspace path (`Users-<owner>-GitHub-<repo>`) or list `~/.cursor/projects/` and pick the matching folder.

**Format:** one JSON object per line. `role` is `user` | `assistant`. User text lives in `message.content[]` parts with `type: "text"`. Attached skills appear in `<manually_attached_skills>` blocks.

**Evidence link:** session uuid folder name — `[title](4798b61a-bb04-488c-913f-69cf04166052)`.

### Codex

```
~/.codex/session_index.jsonl                                    # id, thread_name, updated_at
~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread-id>.jsonl   # recent / active
~/.codex/archived_sessions/rollout-<timestamp>-<thread-id>.jsonl     # archived
```

Use `session_index.jsonl` to map **thread id → thread_name** and filter by `updated_at`. Read transcript bodies from `sessions/` first, then `archived_sessions/` for the same thread id if needed.

**Format:** one JSON object per line with top-level `type`:

| `type`          | Use for                                                         |
| --------------- | --------------------------------------------------------------- |
| `session_meta`  | `payload.cwd`, thread id, originator — filter to repos in scope |
| `response_item` | User/assistant turns when `payload.type === "message"`          |
| `event_msg`     | Turn boundaries; skip for quote extraction                      |

User messages: `payload.role === "user"`, text in `payload.content[]` where `type === "input_text"`. Ignore `<environment_context>`, `<turn_aborted>`, and other wrapper blocks when quoting — extract the user's actual request.

Skills in Codex appear in developer `<skills_instructions>` (available skills list) or when the user names `$SkillName`. Note which skills were in play when the session still went wrong.

**Evidence link:** thread id from filename or `session_meta.payload.id` — `[thread_name](019eeb62-7b17-7b50-9e1e-8ff64cf04612)`. Include **source: Codex** in the evidence line.

**Repo filter:** only include Codex sessions whose `session_meta.payload.cwd` is under the target repo (or a named monorepo path the user cares about). Skip unrelated workspaces unless the automation prompt says to review all Codex threads.

## Scope defaults

Unless the user or automation prompt overrides:

| Setting      | Default                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Time window  | Last **14 days** (Cursor: `.jsonl` mtime; Codex: `session_index.updated_at` or file mtime)                 |
| Max sessions | **40** most recently updated sessions **per source** (80 total cap)                                        |
| Skip         | Empty sessions, subagent-only Cursor folders without a parent in scope, Codex sessions outside repo filter |

Split the session budget evenly when both sources are in scope (e.g. 20 Cursor + 20 Codex) unless one source has fewer matches.

## Procedure

### 1. Inventory existing skills

Before reading transcripts, list skills the agent already has so recommendations **extend or split** existing skills instead of duplicating them:

- Repo: `.agents/skills/*/SKILL.md`
- User Cursor: `~/.cursor/skills-cursor/*/SKILL.md`
- User Claude: `~/.claude/skills/*/SKILL.md`
- Codex: `~/.codex/skills/**/SKILL.md` and skills referenced from repo `.agents/skills/`

Build a short index: skill name → one-line description from front matter.

### 2. Collect transcript evidence

For each session in scope, read the `.jsonl` file line by line using the format rules above.

Extract and tag:

| Tag              | What to capture                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frustration`    | User correction, repeated instruction, caps, "again", "stop", "DO NOT", "partial", "stub", "you didn't", "why did you", explicit rejection of agent output                                |
| `doc-request`    | User asks to update **vendor/morgs32/llm-wiki/patterns/**, **llm-wiki/patterns/**, **architecture**, **AGENTS.md**, **TODOS.md**, **.plans/**, README, or "docs stay in sync" |
| `recurring-task` | Same task type appears in **≥2 sessions** across either or both sources                                                                                                                   |
| `skill-attached` | Skills attached or named (`$SkillName`, `<manually_attached_skills>`, Codex `<skills_instructions>`) — note whether the session still went wrong                                          |
| `agent-mistake`  | Assistant did something the user had to fix: extra refactors, wrapper helpers, wrong runtime boundary, stale doc paths, bolt-on types                                                     |
| `missing-skill`  | User had to spell out a multi-step workflow that no attached skill covered                                                                                                                |
| `cross-tool`     | Same theme in both Cursor and Codex — strong signal for a shared repo skill                                                                                                               |

**Do not** treat assistant `[REDACTED]` placeholders or Codex system/developer preamble as evidence. Prefer **verbatim user quotes** (trim to ≤240 chars).

Use shell search to triage before full reads:

```bash
CURSOR_ROOT="$HOME/.cursor/projects/Users-morgs32-GitHub-zerospin/agent-transcripts"
CODEX_INDEX="$HOME/.codex/session_index.jsonl"
CODEX_SESSIONS="$HOME/.codex/sessions"
CODEX_ARCHIVED="$HOME/.codex/archived_sessions"

# Cursor — recent parent sessions
find "$CURSOR_ROOT" -name '*.jsonl' -not -path '*/subagents/*' -mtime -14 | head -40

# Codex — recent index entries (adjust repo path filter as needed)
rg -i 'zerospin|GitHub/zerospin' "$CODEX_INDEX" 2>/dev/null | tail -40

# Keyword triage across both sources
rg -i 'llm-wiki/patterns|zerospin-llm-wiki|cleanup mode|architecture|AGENTS\\.md|update.*doc|partial|DO NOT|re-export|wrapper|again\\?' \
  "$CURSOR_ROOT" "$CODEX_SESSIONS" "$CODEX_ARCHIVED" --glob '*.jsonl' -l | head -40
```

Then read the highest-signal files fully enough to quote accurately.

### 3. Cluster findings

Group tagged snippets into **themes**. A theme qualifies for output only if:

1. **≥2 independent sessions** show the same pattern (Cursor, Codex, or one of each), **or**
2. **1 session** with strong frustration **and** a clear doc/skill fix, **or**
3. **≥3 doc-request** mentions of the same doc area (e.g. `zerospin-fanout.md`, `BatchWorkflow.md`).

Drop one-off typos, one-shot tasks, and themes already fully covered by an existing skill (say "already covered by `update-llm-wiki`" and skip).

### 4. Map themes → skill actions

For each surviving theme, pick exactly one action type:

| Action                | When                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Deepen**            | Skill exists but transcripts show repeated failure modes it doesn't address                                                  |
| **New skill**         | Recurring multi-step workflow with no skill; propose a concrete name under `.agents/skills/<kebab-name>/`                    |
| **Rule in AGENTS.md** | Single-line guardrail repeated across sessions; not enough for a full skill                                                  |
| **Doc-only**          | User asked for cleanup wiki/architecture updates; route to `update-llm-wiki` or `update-architecture` instead of a new skill |

Prioritize **doc-request** and **frustration** themes over convenience automations.

### 5. Write the report

Output **only** this structure (Markdown). No preamble essay.

```markdown
# Local session review — skill recommendations

**Window:** <dates> · **Cursor sessions scanned:** N · **Codex sessions scanned:** M · **Skills indexed:** K

## Executive summary

<3 bullets max: highest-impact themes only>

## Recommendations

### 1. <Short title>

- **Action:** Deepen `existing-skill` | New skill `<proposed-name>` | Update `AGENTS.md` | Run `update-llm-wiki` / `update-architecture`
- **Why now:** <one sentence tied to frequency or severity>
- **Evidence:**
  - **Cursor** — Session [`<6-word title>`](session-uuid) — user: "<quote>"
  - **Codex** — Thread [`<thread_name>`](thread-id) — user: "<quote>"
- **Proposed skill delta:** <specific section heading or bullet to add, or SKILL.md outline with 3–5 concrete steps>
- **Acceptance check:** <how you'll know the skill worked next time — observable agent behavior>

### 2. ...

## Already adequate

<Skills/themes that appeared but need no change — one line each>

## Deferred / insufficient evidence

<Themes with only one weak signal — what would confirm them>

## Suggested next run

<Which transcript keywords, repos, or Codex cwd filters to watch; optional cron tweak>
```

### 6. Optional artifact

If the automation prompt asks to **persist** the report, write:

```
.plans/plans/local-session-review-YYYY-MM-DD.md
```

Use the next free date; do not overwrite prior reviews. **Do not commit** unless the user or automation explicitly requests a git commit.

## Grounding rules (hard requirements)

1. **Every recommendation must cite ≥1 user quote** from a named session (Cursor uuid or Codex thread id). No quote → no recommendation.
2. **No generic advice** ("write better tests", "read the code first"). Every item must name a **repo path, skill name, doc file, or workflow step**.
3. **Frustration-weighted ranking** — sort recommendations by (frustration signals × recurrence × doc-request bonus). Boost themes that appear in **both** Cursor and Codex.
4. **Doc-update calls are first-class** — if the user asked to sync pattern subtrees or architecture and the agent didn't, recommend `update-llm-wiki` / `update-architecture` with the **exact pattern paths** mentioned in chat.
5. **Do not recommend installing external skills** unless transcripts show a gap **no** repo skill can cover; then use `find-skills` and name the search query you'd run.
6. **Do not implement skills in this pass** unless the prompt explicitly says to — default is report only.

## Anti-patterns

- Listing every session you opened.
- Suggesting skills for solved, merged work.
- Paraphrasing user quotes without session ids.
- Treating Codex `<INSTRUCTIONS>` or Cursor system rules as user frustration — only count explicit user follow-up corrections.
- Recommending abstractions the user's own rules forbid (single-use wrappers, `*Effect` names, etc.) without citing that AGENTS.md already bans them — those belong under **Deepen AGENTS.md enforcement** only if agents keep violating them in transcripts.
