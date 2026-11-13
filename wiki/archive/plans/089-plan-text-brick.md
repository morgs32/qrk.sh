# Brick-Owned Commands and Text Brick

**Outcome:** Completed locally on 2026-11-13. The user ended the production cutover and will handle the Worker separately. The user performs manual UI verification on their own time.

## Problem and decisions

1. Each Brick owns concrete add and update commands and validates its content. Keep a shared Brick record and a closed module ID list. Shared QRK model declarations live in Bricks; Zerospin composes and registers them.
2. Keep `stageAggregateSessionCommand`. Improve Zerospin's session types so the actual App session is usable through a contract-only Brick session context, with correlated command names and payloads and exact result inference. Release the SDK change upstream and consume the published exact version in QRK.
3. A Brick add command creates its Brick and breakpoint Placements in one atomic batch using a shared Wall insertion `Effect.fn`. Wall drop feedback uses shared layout rules; authoritative command evaluation rechecks current state, ownership, and eligibility. Existing generic Wall moves remain.
4. Brick content is shared in `Brick.state`; module-owned breakpoint settings are in `Placement.state`. A Placement selects a Brick-defined layout. Publication snapshots freeze resolved layout and both state values. Preserve Image layout behavior and Storybook spec-generation tooling.
5. Text starts blank and contains one wrapping logical block. Use Meowdown core and a Text-owned toolbar for paragraph, H1–H3, blockquote, bold, italic, strike, links, and one highlight style; hide Markdown punctuation. Enter and Shift-Enter do nothing. Normalize pasted and dropped plain-text line breaks to spaces. Preserve composition, undo, and validation of restored and remote content; stop if the editor API cannot reliably enforce the rule.
6. `updateTextBrick` saves shared content. `updateTextPlacement` saves the selected Placement's font family and size: Geist Sans, Spectral, or Geist Mono; Sans at 16px by default; any positive finite pixel size. Minimum width is 320px; preferred height is 45px and rows may grow.
7. Build a fresh V1 declaration graph and use fresh QRK data. Preserve existing registry registrations and canonical selections unless the user explicitly directs the specific cutover; the user did so for this replacement. Inventory and confirm exact local and deployed storage targets immediately before any reset. Preserve Clerk accounts, credentials, R2 uploads, other systems, and unrelated work.
8. The user chose direct work on main and personal manual verification on 2026-11-13.

## Annotated examples

1. Text stages `updateTextBrick` with the actual App session. Its own command validates the content; the Wall need not know Text-specific commands.
2. A creator changes font size at one breakpoint. Only that Placement's state changes; the Brick's content and other Placements remain unchanged.
3. Dropping a new Brick commits its Brick and breakpoint Placements together. The command repeats eligibility checks against current state even if the prior drag preview was valid.

```ts
// A Brick chooses the command; the session is the existing App session.
stageAggregateSessionCommand({
  session,
  contractName: "updateTextBrick",
  payload: { brickId, state },
});
```

## Implementation and verification

1. Implement and test the upstream contract-only session typing and correlated command payloads. Preserve lifecycle behavior, synchronous results, Effect requirements and existing callers. Release from clean scoped inputs and update QRK's exact package pins.
2. Create the fresh shared model graph without altering historical declarations. Implement every module's add/update commands and shared Wall insertion, and register a separate fresh owner graph without altering the existing System registry.
3. Integrate placement state, module-owned layouts, Wall drag/drop, the Brick session context, unified rendering, and publication snapshots. Preserve existing Image behavior and interactive embeds. Trace the published-page seam and report missing wiring.
4. Complete Text editing, typography and catalog integration. Test single-block input, formatting, hidden syntax, conversions, paste, drop, restored/remote content, undo/redo, composition and breakpoint persistence.
5. Test command atomicity, ownership, invalid content and stale drop targets; verify all modules. Run Bricks checks, backend tests and App/Web builds. Exercise fresh-baseline publication and distinguish local, live and production evidence. The user performs manual verification.
6. Present exact registry changes and evidence for user direction; confirm reset targets immediately before resetting. Reconcile the glossary after implementation and create an ADR only if the implemented decision meets repository criteria. Archive only after implementation and required agent checks complete.

## Verification and remaining work

1. Zerospin 44.0.3 was built and published to the existing local registry from a clean committed checkout. Its suite passed 46 files / 291 tests; two additional focused tests passed for contract-only session lifecycle and custom Effect services. QRK's fixed-group pins were updated and a frozen offline install passed.
2. Before the registry cutover, QRK's backend target passed 15 files / 47 tests, including the fresh isolated owner, all Brick add/update commands, ownership and stale-drop rejection, four Placements, per-breakpoint typography, Wall move/delete, and frozen publication snapshots. After the registry cutover, historical tests were migrated to the registered V1 graph and the backend target passed 15 files / 31 tests. This does not prove Clerk authentication, distributed admission, real browser synchronization, or production publication.
3. Bricks TypeScript, import checks, Storybook build, focused Text formatting/input tests, Image layout tests, Article placeholder tests, and mocked generation tests passed. The App typecheck and build passed. Web typecheck, webpack build, and standard Turbopack build passed; the latter required disabling the Nx native command runner outside the network sandbox after its CSS worker hit `EPERM`. Real editor rendering, hidden Markdown syntax, and actual IME remain for the user's manual verification.
4. The user explicitly directed the agent to make the exact registry replacement below; fresh User V1 is now canonical. Historical User releases 9–20 were retired for this reset. The existing user-only rule remains in place for future registry changes.
5. The user explicitly directed the agent to wipe the named local System store instead of moving it to a backup; it was removed on 2026-11-13 after checking for active Portless routes and open files. Browser journals remain uninspected. Read-only production analytics confirmed the sole listed SystemRepo object's identity as `sys_qrk_sh_1`; its contents and any unbound historical namespaces remain uninspected. See [production storage research](../../research/qrk-production-storage-reset.md) and the canceled cutover record below.
6. After the user started the configured HTTPS proxy, the local Zerospin service reported `Ready ... (system spec accepted)` for `sys_qrk_sh_1`; its configured HTTPS route is reachable. Publication snapshots were verified in the harness; browser synchronization and real IME behavior remain for the user's manual verification. [ADR 002](../../adrs/002-brick-owned-commands-and-placement-state.md) records the implemented ownership and storage decision.

## Registry cutover

The new graph cannot coexist with registered releases 9–20 under the same System identity: their retained `user` declaration identities include V1 declarations with different schemas. The user explicitly directed the agent to apply the following exact replacement to `apps/zerospin/src/system.ts` for this cutover:

```ts
import { makeSystem } from "@zerospin/sdk";
import { userAggregateV1 } from "./fresh/userAggregateV1";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: {
    user: {
      releases: { 1: userAggregateV1 },
      canonical: 1,
    },
  },
});
```

This retired the existing User releases and is not a compatible replay. The explicit instruction applied to this replacement only; the repository’s user-only registry rule remains in place for future changes.

The local System store at `apps/zerospin/.wrangler/zerospin/dev-worker/sys_qrk_sh_1` was 235 MB when inspected. The user instructed the agent to wipe that exact directory rather than move it to a backup; it was removed on 2026-11-13 after checking for active routes and open files. A fresh local SystemSpec was accepted, and the configured Zerospin, App, Web and API routes were started. Browser session journals require separate inspection. The deployed `qrk-zerospin` Worker and its bindings were inspected read-only; individual production Durable Object contents and exact reset operations remain unconfirmed. Do not reset production from namespace names alone.

## Planned file areas

`+` creates; `~` modifies.

```text
zerospin/
└── ~ packages/core/ and packages/sdk/       # command session typing and tests
qrk.sh/
├── ~ AGENTS.md and wiki/glossary.md
├── ~ wiki/plans/089-plan-text-brick.md
├── + wiki/research/brick-owned-drag-and-drop.md
├── ~ apps/bricks/                           # fresh models, Brick commands and rendering
├── ~ apps/app/                              # session and Wall integration
├── + apps/zerospin/src/fresh/               # V1 owner graph, registered at cutover
├── + apps/zerospin/test/fresh*.spec.ts
└── ~ apps/web/library/                      # fresh snapshot viewer
```

## Production inventory — 2026-11-13

Read-only Cloudflare deployment metadata reported `qrk-zerospin` at Worker version `e807836b-b6a7-4484-9d1a-1cf0e3097ce1`. A fully paginated object listing returned one stored object across the 21 Durable Object namespaces bound to that version: namespace `SYSTEM_REPO` (`395991eff721400488bbf1d674db32e2`), object `bf0c9945d59b152c462120c097f4167b9ac8d7abc6701c9102a6382f8a23c5fd`. It returned no objects for the other bound namespaces. Read-only Cloudflare analytics independently associates that object with `sys_qrk_sh_1`, without activating it. Its contents and any unbound historical namespaces remain uninspected. See [production storage research](../../research/qrk-production-storage-reset.md) for the query and reset options.

[Cloudflare's object-list API](https://developers.cloudflare.com/api/resources/durable_objects/subresources/namespaces/subresources/objects/methods/list/) reports object IDs and stored-data flags; it does not delete storage or identify application ownership. The existing Zerospin `SystemRepo` exposes no identified reset operation. Cloudflare documents [object-owned `deleteAll`](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/); no new production reset endpoint or namespace deletion is authorized by this inventory. Reinspect immediately before any production cutover and obtain confirmation for the exact operation.

Cloudflare's [Data Studio](https://developers.cloudflare.com/durable-objects/observability/data-studio/) runs queries against the deployed Durable Object and can activate it. The exact deployed Worker bundle was inspected in memory: its `SystemRepo` activation path includes an accepted-SystemSpec migration gated by configuration. Whether that migration is enabled is not established, so even a SQL `SELECT` cannot yet be assumed free of application side effects. No production SQL query was issued.

On 2026-11-13 the user explicitly authorized resetting this identified object and completing the Text Brick production cutover. A fresh, fully paginated inventory found exactly the same object and no objects in the other 20 bound namespaces. A temporary maintenance Worker was promoted and the inventory still showed the object with stored data. The reset request was interrupted before a result was observed. The user then canceled the production cutover, plans to delete the Worker, and requested local completion only. No further production action was taken after that instruction; the interrupted reset's outcome was not verified.

## Remaining work

None for the agreed local scope. Production cutover was canceled by the user. The user will perform manual UI verification separately.
