# Terminal command delta

## Smell

A terminal occurrence omits its complete encoded command or forces consumers
to reconstruct the resource change from command payloads.

## Pattern

Retain one complete encoded command with its structural terminal state and
command-local delta. Forward that same occurrence across outboxes, RPC,
WebSocket, and browser journals. See
`system-worker/preserve-command-payloads-across-chains.ts` and
`contracts/iencoded-command-at-boundary-only.ts`.

## When to apply

Chain persistence, materializer results, finalized frontend history, socket
delivery, and replica reconstruction.
