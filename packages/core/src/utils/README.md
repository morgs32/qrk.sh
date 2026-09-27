# RPC invocation with getApi

`getApi<GatewayApi>(endpoint)(select)` returns a reusable Effect-facing API.
Acquisition and constructing a method Effect perform no network work. Each
execution opens a fresh Cap'n Web HTTP batch, synchronously selects the
capability, invokes the terminal method, and disposes the session through an
internal Effect scope. Interruption closes that local session; it does not
establish that remote work was canceled.

Selectors only select capabilities. Acquire credentials or capture direct identity beforehand;
captured credentials remain the caller's responsibility to refresh. Sequential
calls and reexecuted Effects use fresh sessions. Concurrent calls use separate
HTTP requests, while each capability chain and terminal invocation pipeline in
one request. This replaces the former shared-batch executeRpc interface.

The proxy supplies trace context and collects returned trace links. Domain
failures pass through unchanged. Invocation rejection is `async-failed`, with an
unknown remote outcome. Invalid envelopes are `rpc-invalid-response`; local
session acquisition or capability selection failures are `rpc-selection-failed`.
These latter codes are not transient retry signals. The module never retries.

Diagnostics include the actual method, endpoint without credentials/query/fragment,
available trace identifiers, and original cause. Request arguments are not added
to diagnostic metadata. Causes are retained as supplied, not treated as proof
of a network diagnosis or sanitized into a different exception.

Low-level `newSyncRpcSession` remains available for callers that explicitly own a
single native Cap'n Web batch.
