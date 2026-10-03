# Source command and selected occurrence

## Smell

A source admission or execution boundary strips a command and later forces a
consumer to reconstruct payload or provenance. The inverse smell is forwarding
that complete source or its execution entry across the session seam when the
browser only consumes selected resource changes and completion identity.

## Pattern

Retain the complete encoded command throughout admission, execution, source
chains, source outboxes/RPCs, and source journals. Selection instead derives a
new minimal selected-command occurrence: opaque source command ID, selected
position and source watermark, `upserted`/`deleted` changes, the relevant
session-history hash, and any privately deliverable terminal failure. The browser command itself has only
`id`, `commandName`, `delta`, and `failure`; positions and hashes are envelope fields. The browser
resolves its own journal by command ID and retains the first resolving
position, hash, and selected delta. Repeated occurrences apply new deltas while
preserving that outcome. Covered historical outcomes do not reapply deltas. It never
reconstructs a chained source command. See
`system-worker/preserve-command-payloads-across-chains.ts` and
`contracts/iencoded-command-at-boundary-only.ts`.

## When to apply

Source chain persistence and materializer results use the complete command.
AAVC/SAVC persistence, session snapshot reconciliation, WebSocket
delivery, and browser application use the minimal selected occurrence.
