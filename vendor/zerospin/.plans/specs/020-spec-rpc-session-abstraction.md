# RPC session abstraction design

**Date:** 2026-07-12
**Status:** Draft

## Problem Statement

`newSyncRpcSession` currently adapts Cap’n Web's asynchronous target typing into Zerospin's synchronous nested-target client shape with conditional mapped types and a cast at the construction boundary. Concrete `ZerospinApis` clients need the nested `FrontendApi | FrontendApiFailure` and `SystemApi | SystemApiFailure` targets unobfuscated, while traceable leaf proxies are installed only after capability acquisition.

The frontend Logs work deliberately uses the concrete session factory directly. Generalizing session construction before that path is proven would conflate transport ownership, target type transformation, capability acquisition, target decoration, collector requirements, and disposal.

## Solution

After the concrete frontend and SystemApi migrations are stable, define one RPC-session boundary that owns Cap’n Web session creation, synchronous nested-target typing, and disposal without hiding the concrete API classes. Target tracing remains explicit at the leaf capability seam unless repeated client code demonstrates that decoration belongs in session construction.

The abstraction must earn its existence through multiple concrete call sites. It must not recursively proxy arbitrary returned targets or introduce a second API interface hierarchy.

## User Stories

1. As a client author, I want one correctly typed disposable session constructor, so that concrete nested RPC targets remain usable without local casts.
2. As a library maintainer, I want the transport adaptation isolated at its real boundary, so that Cap’n Web type mechanics do not leak into domain programs.
3. As a frontend maintainer, I want traceable target decoration to remain explicit, so that session construction does not silently require a telemetry collector.
4. As a type-system maintainer, I want emitted declarations to preserve concrete target unions and method signatures.

## Implementation Decisions

1. Keep the abstraction in the transport-owning package rather than React or DevTools.
2. Preserve concrete `ZerospinApis`, `FrontendApi`, `FrontendApiFailure`, `SystemApi`, and `SystemApiFailure` shapes.
3. Preserve deterministic `Symbol.dispose` ownership for the underlying Cap’n Web session.
4. Do not add a parallel `IFrontendApi`, `ISystemApi`, or general target interface solely to simplify the mapped type.
5. Do not automatically recurse through arbitrary RPC return values.
6. Do not automatically install telemetry layers, collectors, retries, authentication, or domain-error mapping.
7. Keep API-target tracing as a separate explicit composition unless at least two proven consumers require identical decoration at session construction.
8. Remove the current cast only through a sound transport-factory or base-type correction. Do not add `ALLOWED_CAST` or bolt an intersection onto individual call sites.
9. Keep the public surface minimal and avoid a barrel export.

## Testing Decisions

1. Use compile-time tests as the primary seam: a concrete ZerospinApis session must synchronously return both concrete success and failure targets with callable leaf methods and correct linked envelopes.
2. Retain the existing MSW plus Cap’n Web batch integration tests for request batching, nested targets, rejection, and disposal.
3. Add emitted-declaration inspection proving concrete class names and public leaf signatures remain available without private fields leaking.
4. Prove session construction works without a telemetry collector and target tracing fails only when a traced leaf is executed without its required collector.
5. Prove no recursive transformation is applied to unrelated returned objects.

## Out of Scope

1. Changing Cap’n Web's transport protocol.
2. A custom `RpcTransport` or batch bridge for Cloudflare `Fetcher` bindings.
3. Authentication, retry, telemetry persistence, or API-handler policy.
4. Reintroducing shared API interfaces.
5. Moving browser domain programs back into core or React.

## Further Notes

1. The final grill must decide the package and exact public name only after the frontend package's emitted artifacts show where the transport runtime actually belongs.
2. The final grill must decide whether the existing `newSyncRpcSession` name survives or is replaced; compatibility aliases are not assumed.
3. The final grill must inspect whether Cap’n Web's current type surface can express the transformation without a cast before approving implementation.

