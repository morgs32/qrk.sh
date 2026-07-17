# WebSocket session telemetry design

**Date:** 2026-07-12
**Status:** Draft

## Problem Statement

`acquireFrontendWebSocket` currently belongs to React bootstrap orchestration. It constructs and authenticates the subscriber URL, captures the session runtime, decodes each frontend-block message, applies the block, advances session cursors, and returns a scoped release Effect. The frontend Logs design intentionally leaves this path unchanged, so connect, message, decode, apply, close, and error behavior do not yet have an explicit telemetry contract.

WebSocket work differs from request-response RPC: one connection can deliver many messages, callbacks outlive acquisition, reconnection may create a new lifecycle, and server-side upgrade plus Durable Object delivery spans cannot be returned in a leaf response envelope.

## Solution

Define WebSocket telemetry as session-owned browser telemetry with separate spans for connection lifecycle and each received frontend block. Preserve the existing session collector across asynchronous callbacks. Record browser-side decoding and application failures without fabricating a server parent-child relationship.

Package ownership and cross-store server linking remain separate decisions because the current protocol carries no server span context in an accepted socket or frontend-block message.

## User Stories

1. As a frontend developer, I want each WebSocket connection attempt and closure visible in its owning session.
2. As a frontend developer, I want each received frontend block decoded and applied under its own span, so that a bad message or reconciliation failure is attributable.
3. As a DevTools user, I want WebSocket spans to appear live in the existing Logs trace view without a separate telemetry store.
4. As a maintainer, I want release and callback lifetimes represented accurately rather than forcing a long-lived Effect span across the entire socket lifetime.
5. As an operator, I want transport errors recorded without silently changing session cursor state.

## Implementation Decisions

1. Keep one stable telemetry collector per browser session and use it for all WebSocket callback Effects.
2. Represent connection acquisition, open, message handling, error, close, and explicit release as distinct finite spans or logs; do not keep one Effect span open for the socket's entire lifetime.
3. Give every frontend-block message a named span that includes decode, stale-cursor admission, block application, and cursor update.
4. Treat skipped stale messages as successful observed outcomes rather than errors.
5. Record decode and apply failures as failed browser spans and leave session cursor state unchanged for that message.
6. Preserve scoped close behavior and ensure release remains idempotent under React unmount and bootstrap failure.
7. Do not fabricate a server trace link when the WebSocket protocol provides no server trace context.
8. Add server links only if a later approved wire-format change carries a complete `ISpanLinkRecord` or sufficient server span identity with each message.
9. Reuse the existing Logs tab, Unattached section, and session clear semantics.
10. Do not add automatic reconnect or retry as part of telemetry instrumentation.

## Testing Decisions

1. Use the existing browser bootstrap WebSocket test seam with a controllable WebSocket implementation as the primary proof.
2. Prove connection, message decode, successful apply, stale-message skip, decode failure, apply failure, close, and explicit release telemetry all land in only the owning session.
3. Prove cursor updates occur only after successful block application.
4. Prove callback telemetry continues to append after a Logs clear and stops after session release.
5. Prove no server boundary link is emitted without protocol-provided server context.
6. Preserve URL, authentication-query, unavailable-browser, and close-on-release assertions.

## Out of Scope

1. Automatic reconnect, backoff, or message replay.
2. A WebSocket protocol change for server trace context.
3. Server-side upgrade or Durable Object subscriber telemetry.
4. Moving the WebSocket code into `@zerospin/frontend` before package ownership is approved.
5. A separate WebSocket Logs UI.

## Further Notes

1. The final grill must decide whether `acquireFrontendWebSocket` remains React-owned orchestration or moves into `@zerospin/frontend` as non-React browser transport behavior.
2. The final grill must decide whether browser `error` and `close` events are logs on the acquisition trace or independent root spans.
3. The final grill must decide whether the wire protocol should later carry server trace identity; that decision requires a separate server-side subscriber design.

