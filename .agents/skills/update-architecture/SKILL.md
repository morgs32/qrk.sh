---
name: update-architecture
description: >-
  Sync wiki/architecture workflow docs with source code: mermaid diagrams,
  Trigger steps, and Annotated workflow steps. Use when the user asks to update
  architecture docs, workflow docs, mermaid in wiki/architecture, or says
  update-architecture.
---

# update-architecture

Keep `wiki/architecture/*.md` workflow docs aligned with the code they describe.

The post-commit LLM Wiki ingest hook may also update these pages.

## When to apply

- The user changed a workflow, API entrypoint, or repo path and wants the architecture doc updated.
- The user says **update-architecture**, **update mermaid**, or points at `wiki/architecture/` with code that drifted.
- Stay within the **named doc(s)** unless they ask for a broader pass.

## Workflow

1. **Read the source first**  
   Open the implementation files the doc links to (Api, entrypoint, workflow, repo). Trace the real call order — do not edit the doc from memory.

2. **Update both diagram types when the doc has them**
   - **Sequence diagram** — trust-boundary and RPC path (who calls whom, `makeAsync`, `decodeRpc`, early failures, conditional branches).
   - **Flowchart** — lifecycle or workflow phases after the trigger (named Effects, SystemWorker/Repo calls, branch gates).

3. **Update the Trigger section**  
   Numbered list mirroring the **triggering** code path (for example, a CLI command, package entrypoint, or `*Api` method). One numbered step per phase; nest sub-steps for entrypoint/repo delegation.

4. **Update Annotated workflow steps**  
   Numbered list for the workflow or lifecycle implementation itself (`Effect.fn`, runtime boundary, repo calls, returned receipts, and branch conditions). Separate it from Trigger so invocation and implementation remain distinct.

5. **Use preview-safe relative links**  
   From `wiki/architecture/Foo.md`:
   - Source under repo root: `../../packages/...`, `../../examples/...`, `../../docs/...`
   - Sibling architecture doc: `./OtherWorkflow.md`
   - Do **not** use root-absolute paths like `/packages/...` — Markdown preview will not open them.

6. **Link labels**  
   Prefer ``[`Symbol.method`](relative/path.ts)`` or ``[`file.ts`](relative/path.ts)``. Match symbol names in the linked file.

7. **Keep scope tight**  
   Update only the sections that drifted. Do not rewrite unrelated architecture docs or fix root-absolute links elsewhere unless asked.

8. **Frontmatter**  
   After substantive edits, bump `updated`.

## Section templates

### Trigger (CLI → conventional Worker boundary)

```markdown
## Trigger

1. [`devFn`](../../../packages/cli/src/dev/devFn.ts)
   1. Load and validate the project configuration.
   2. Generate the local Wrangler configuration, start `DevWorker`, and start or resume each observed Worker version in its requested clean mode.
2. [`DevWorker.fetch`](../../../packages/dev-worker/src/DevWorker.ts)
   1. Resolve singleton `SystemRepo` by exact `systemId`.
   2. Forward every development control-plane and data-plane request to that Durable Object.
3. [`ProductionWorker.fetch`](../../../packages/production-worker/src/ProductionWorker.ts)
   1. Reject malformed frontend WebSocket upgrade syntax at the entrypoint.
   2. Resolve the same singleton `SystemRepo` by exact `systemId` and forward the request.
```

### Annotated workflow steps (lifecycle implementation)

```markdown
## Annotated workflow steps

1. [`SystemRepo`](../../../packages/system-worker/src/SystemRepo/SystemRepo.ts)
   1. Validate the exact `systemId` and initialize the consolidated deploy, generation, drain, replay, ticket, reservation, and registration schema.
   2. Allocate or resume the deploy keyed by `{ workerVersionId, clean }`, with Worker-version identity supplied by Worker metadata inside lifecycle coordination.
   3. Run freeze, prepare, open, retire, and state inspection as local named Effects that invoke generation-keyed child Repos directly.
   4. Promote in one short transaction only after the persisted remote postconditions and final activation checkpoint are proven.
   5. Route generation-specific reads by their acquired `generationId`, while ordinary mutations reserve the singleton's current ready open generation internally.
```

## Mermaid conventions

- **Sequence**: name participants after runtime boundaries (`CLI`, `DevWorker` or `ProductionWorker`, hosted `Dispatch Worker` when present, stable Worker-hosted `GatewayApi`, `SystemRepo(systemId)`, `AuthenticatedApi` or another child capability, generation-keyed child Repos, `SystemWorker`). Show `makeAsync` / `decodeRpc` where the source uses them. Use `alt` for missing-input failures and real branch gates.
- **Flowchart**: use one subgraph per public workflow or lifecycle. Node labels = method or phase names. Branch labels = `"yes"` / `"no"` on the condition that matches code.

## Checklist before finishing

- [ ] Sequence diagram matches the triggering path through the first public runtime or repo boundary.
- [ ] Flowchart matches the implementation's named phases and branch conditions.
- [ ] Trigger and Annotated sections are separate and numbered consistently.
- [ ] Every ``[`…`](…)`` link uses a relative path from the doc file.
- [ ] No behavior invented — each step traceable to a line in source.
- [ ] Frontmatter `updated` date reflects substantive edits.

## Example

Canonical reference after a pass: [System Lifecycle](../../../wiki/architecture/SystemLifecycle.md).
