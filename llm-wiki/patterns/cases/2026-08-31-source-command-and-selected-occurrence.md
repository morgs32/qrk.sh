# Source command and selected occurrence

## Smell

A source admission or execution boundary strips a command and later forces a
consumer to reconstruct payload or provenance. The inverse smell is forwarding
that complete source or its execution entry across the frontend seam when the
browser only consumes selected resource changes and completion identity.

## Pattern

Retain the complete encoded command throughout admission, execution, source
chains, source outboxes/RPCs, and source journals. Selection instead derives a
new minimal selected-command occurrence: opaque source command ID, selected
position and source watermark, `upserted`/`deleted` changes, the relevant
frontend-history hash, and any privately deliverable failure. The browser
stores that selected occurrence as the local command's outcome; it never
reconstructs a chained source command. See
`system-worker/preserve-command-payloads-across-chains.ts` and
`contracts/iencoded-command-at-boundary-only.ts`.

## When to apply

Source chain persistence and materializer results use the complete command.
SelectionVAC/FSC persistence, frontend snapshot reconciliation, WebSocket
delivery, and browser application use the minimal selected occurrence.
