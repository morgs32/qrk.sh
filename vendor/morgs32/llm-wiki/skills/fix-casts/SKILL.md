---
name: fix-casts
description: Audit TypeScript `as` assertions in Zerospin that do not have an `ALLOWED_CAST` comment immediately above them. Use when the user asks to triage casts, verify whether assertions are actually required, or continue a cast-cleanup pass one site at a time.
---

# Fix Casts

## Purpose

Prove whether an unapproved TypeScript assertion is still needed. Start from `as` assertions whose immediately preceding line does not contain an `ALLOWED_CAST` comment, remove the assertion, run the narrow typecheck, and only keep moving when TypeScript agrees.

## Rules

1. Start with current source, not old plans or memory.
2. Work one assertion site at a time unless the user explicitly asks for a batch.
3. Do not add a helper, wrapper, named type, export, loop, or runtime-boundary move without explicit approval.
4. Do not replace a failed cast removal with another cast.
5. **Never add `ALLOWED_CAST` unless the user explicitly approves or requests that exact site** (file + assertion). On a failed removal, report the error and non-cast options, then stop and ask — do not paper over with `ALLOWED_CAST` on your own.
6. If removing the assertion causes a type error, **leave the `as` removed**, stop, and report the exact error plus non-cast repair options. **Do not restore the cast** to green the workspace — the user should see the TS error in the IDE at the blocker site.
7. **Never restore a removed cast** when stopping at a blocker — not to fix a failed batch, not to undo a multi-file attempt, not to leave `core:ts` green. Only put the cast back when the user explicitly asks to restore that site.
8. If no reasonable non-cast repair exists, say that directly and ask how to proceed (restore the cast without `ALLOWED_CAST`, approve `ALLOWED_CAST` for that site, or pursue a non-cast repair). Until they choose, the blocker stays cast-free with a visible type error.
9. If the assertion removal passes typecheck, leave the removal in place and continue to the next site.
10. **Batch mode:** when the user asks to keep going (or does not say stop), continue removing and verifying casts site-by-site across the inventory until the first site whose removal fails typecheck and has no reasonable non-cast repair without approval. Stop only at that blocker; summarize all sites fixed in the pass plus the first blocked site in the final report. Do not add `ALLOWED_CAST` during a batch pass without per-site approval. Verified removals from earlier in the batch stay removed; the blocker cast stays removed too.

## Workflow

1. Inventory current unapproved `as` assertions:

```sh
node --input-type=module <<'NODE'
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const files = execFileSync(
  "rg",
  [
    "--files",
    "apps",
    "packages",
    "e2e",
    "--glob",
    "*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
    "--glob",
    "!**/dist/**",
    "--glob",
    "!**/node_modules/**",
    "--glob",
    "!**/.wrangler/**",
  ],
  { encoding: "utf8" },
)
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

for (const fullPath of files) {
  const sourceText = fs.readFileSync(fullPath, "utf8");
  const sourceFile = ts.createSourceFile(fullPath, sourceText, ts.ScriptTarget.Latest, true);
  const lines = sourceText.split(/\r?\n/);

  const report = (node) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    if (lines[line - 1]?.includes("ALLOWED_CAST")) return;
    console.log(`${fullPath}:${line + 1}:${character + 1}: ${node.getText(sourceFile).split(/\r?\n/, 1)[0]}`);
  };

  const walk = (node) => {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) report(node);
    ts.forEachChild(node, walk);
  };

  walk(sourceFile);
}
NODE
```

2. Pick the next site by smallest blast radius:
   - the user's active or named file first
   - then nearby sites in the same file
   - then same boundary family, such as Cloudflare DO lookup, Dynamic Dispatch, RPC decode, Drizzle row/table, or test fixture

3. Read the surrounding code before editing. Include the function signature, imports, and nearby caller/return type when relevant.

4. Remove the specific `as ...` assertion. Do not remove unrelated comments or assertions.

5. Run the narrowest meaningful check:
   - Find the owning target with `pnpm nx show project <project> --json` when unsure.
   - Prefer `pnpm nx run <project>:ts` for source/type changes.
   - Use the relevant `:lib`, `:test`, or `:test:workerd` only when the cast site belongs to generated declarations or runtime behavior.

6. Interpret the result:
   - Pass: keep the removal in place and continue to the next site (batch mode) or report and stop (single-site mode).
   - Fail: **leave the cast removed** (workspace may fail `core:ts` — that is intentional), stop the batch at this site, and report:
     - the file and line
     - the exact TypeScript error (paste from `pnpm nx run <project>:ts`)
     - why the assertion had been hiding the mismatch
     - the smallest non-cast repair options
   - Do **not** add `ALLOWED_CAST` or restore the cast unless the user explicitly asks for that site.

7. Do not silently broaden the scope after a failure. Wait for approval before editing shared signatures, public APIs, generated Worker declarations, repo factory types, or runtime-boundary code, or before adding `ALLOWED_CAST` at any site.

## Common Outcomes

- Generated Durable Object bindings may already preserve `DurableObjectNamespace<T>` and `DurableObjectStub<T>`. If `getByName` typechecks without the cast, delete the stale annotation/assertion.
- Dynamic Dispatch may only type scripts as `Fetcher`. A `Fetcher -> WorkerEntrypoint RPC class` conversion is a real runtime-boundary gap unless an approved typed boundary repair exists.
- Cloudflare RPC stubs may erase encoded Either results to `unknown`. If `decodeRpc(encoded)` fails, propose a shared decode/signature repair or a local schema decode, but do not restore the cast unless the user asks.
- Test fixture casts may be legitimate when the fixture intentionally violates the static shape to exercise validation failures. Still remove and typecheck first; if it fails, leave it removed and stop for approval.

## Final Report

Keep the report short:

1. Sites removed and verified.
2. Commands run.
3. First blocked site, if any, with the exact error and non-cast options.
4. Confirm the blocker site still has **no cast** and the workspace is intentionally red until the user picks a repair or asks to restore the cast.
