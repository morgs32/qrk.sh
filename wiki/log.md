---
title: Log
type: meta
updated: 2026-07-17
---

# Log

Append-only chronological record for the fresh public repository. Every ingest,
lint, and query entry starts with
`## [YYYY-MM-DD HH:MM] <op> | <commit-sha> | <one-line summary>`.

## [2026-07-16 22:41] ingest | working-tree | session signatures, React push ownership, and mock provider

1. Documented session-owned signature generation, provider-owned automatic push, and the narrow DevTools manual-push capability.
2. Documented the local-only React mock provider's typed fixtures, real SQLite initialization, optimistic staging, unsupported remote boundary, and exactly-once cleanup paths.

## [2026-07-17 14:42] ingest | working-tree | generation admission and frontend WebSocket tickets

1. Expanded the durable generation lifecycle with readiness/admission states,
   opening and draining semantics, drain order, retry behavior, and the local
   HTTP readiness distinction.
2. Added the fixed frontend WebSocket ticket lifecycle, hash-only storage,
   one-use redemption, direct hibernating FrontendBlockRepo ownership, browser
   handshake behavior, and external error surface.
3. Updated FrontendApi, Blockchain, overview, index, glossary, and the internal
   repo-prefix pattern for the implemented ownership and routing boundaries.
