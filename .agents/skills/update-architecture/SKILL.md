---
name: update-architecture
description: >-
  Sync docs/architecture workflow docs with source code: mermaid diagrams,
  Trigger steps, and Annotated workflow steps. Use when the user asks to update
  architecture docs, workflow docs, mermaid in docs/architecture, or says
  update-architecture.
---

# update-architecture

Keep `docs/architecture/*.md` workflow docs aligned with the code they describe.

## When to apply

- The user changed a workflow, API entrypoint, or repo path and wants the architecture doc updated.
- The user says **update-architecture**, **update mermaid**, or points at `docs/architecture/` with code that drifted.
- Stay within the **named doc(s)** unless they ask for a broader pass.

## Workflow

1. **Read the source first**  
   Open the implementation files the doc links to (Api, entrypoint, workflow, repo). Trace the real call order — do not edit the doc from memory.

2. **Update both diagram types when the doc has them**
   - **Sequence diagram** — trust-boundary and RPC path (who calls whom, `makeAsync`, `decodeRpc`, early failures, conditional branches).
   - **Flowchart** — workflow steps after the trigger (`WorkflowStep.do`, SystemWorker/Repo calls, branch gates).

3. **Update the Trigger section**  
   Numbered list mirroring the **triggering** code path (usually an `*Api` method). One numbered step per phase; nest sub-steps for entrypoint/repo delegation.

4. **Update Annotated workflow steps**  
   Numbered list for the **workflow class** itself (`*.run`, each `step.do`, payloads returned, spawn conditions). Separate from Trigger — Trigger ends when the workflow is enqueued.

5. **Use preview-safe relative links**  
   From `docs/architecture/Foo.md`:
   - Source under repo root: `../../apps/...`, `../../internal/...`, `../../packages/...`
   - Sibling architecture doc: `./OtherWorkflow.md`
   - Do **not** use root-absolute paths like `/apps/...` — Markdown preview will not open them.

6. **Link labels**  
   Prefer ``[`Symbol.method`](relative/path.ts)`` or ``[`file.ts`](relative/path.ts)``. Match symbol names in the linked file.

7. **Keep scope tight**  
   Update only the sections that drifted. Do not rewrite unrelated architecture docs or fix root-absolute links elsewhere unless asked.

## Section templates

### Trigger (Api → workflow enqueue)

```markdown
## Trigger

1. [`SurfaceApi.pushStagedAccountCommands`](../../apps/apis/src/SurfaceApi/SurfaceApi.ts)
   1. Read `surfaceName` from `stagedCommands[0]?.surfaceName`; fail if missing.
   2. Resolve `SystemWorker` via [`getSystemWorker`](../../apps/apis/src/getSystemWorker/getSystemWorker.ts).
   3. `makeAsync` → entrypoint RPC → `decodeRpc` → `{ pushed, failed }`.
   4. If `pushed.length > 0`, allocate workflow id and call `create…Workflow`.
   5. Return `{ pushed, failed }`.
```

### Annotated workflow steps (workflow class body)

```markdown
## Annotated workflow steps

1. [`FinalizePushedAccountCommandsWorkflow.run`](../../apps/apis/src/workflows/.../FinalizePushedAccountCommandsWorkflow.ts)
   1. Destructure payload fields.
   2. Run `step.do('finalize')` via [`FinalizeStep.ts`](../../apps/apis/src/workflows/.../FinalizeStep.ts).

2. Step `finalize`
   1. Resolve [`SystemWorker`](../../packages/system-worker/src/SystemWorker.ts).
   2. `makeAsync` → `finalizePushedAccountCommands` → `decodeRpc`.
   3. Return `{ accountId, hadNewFinalizedCommands }`.
```

## Mermaid conventions

- **Sequence**: name participants after runtime boundaries (`SurfaceApi`, `SurfaceApiEntrypoint`, `SurfaceRepo`, workflow class). Show `makeAsync` / `decodeRpc` on the Api side when used. Use `alt` for missing-input failures and `pushed.length > 0` (or equivalent gates).
- **Flowchart**: one subgraph per workflow. Node labels = method or step name strings. Branch labels = `"yes"` / `"no"` on the condition that matches code.

## Checklist before finishing

- [ ] Sequence diagram matches the triggering Api method through workflow enqueue.
- [ ] Flowchart matches `Workflow.run` and each `step.do`.
- [ ] Trigger and Annotated sections are separate and numbered consistently.
- [ ] Every ``[`…`](…)`` link uses a relative path from the doc file.
- [ ] No behavior invented — each step traceable to a line in source.

## Example

Canonical reference after a pass: [`docs/architecture/BatchWorkflow.md`](../../docs/architecture/BatchWorkflow.md).
