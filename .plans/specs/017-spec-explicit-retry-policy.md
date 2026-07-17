# Explicit retry policy design

**Date:** 2026-07-12
**Status:** Draft

## Problem Statement

Retry behavior is currently inconsistent across Zerospin boundaries. SystemApi applies a shared transient Durable Object reset schedule to many reads and mutations, deployment paths contain local retry schedules, deferred Repo delivery owns separate retry and alarm behavior, and the frontend Logs design removes authentication, bootstrap, and FrontendApi leaf retries entirely.

A generic transport retry is unsafe for every method. Retrying capability construction can repeat authentication work; retrying mutations can duplicate effects unless the domain owns idempotency; retrying telemetry persistence can advertise uncertain storage; and browser bootstrap retries can repeat an entire multi-step session initialization rather than the failed operation.

## Solution

Adopt an explicit retry inventory in which every retry is owned by the narrowest domain or transport boundary capable of proving safety. The default is one attempt. A method receives a retry only when its failure classification, idempotency, attempt limit, delay schedule, telemetry relationship, and terminal behavior are documented and tested.

Transport reset detection remains separate from the decision to retry. Detecting a transient Durable Object error does not authorize replaying an operation.

## User Stories

1. As a maintainer, I want every retry visible at the owning operation, so that retries cannot be introduced accidentally by a generic wrapper.
2. As a domain owner, I want mutation retries allowed only when the operation proves idempotency or durable deduplication.
3. As an operator, I want each attempt and terminal failure represented in telemetry with explicit `retryOf` relationships.
4. As a frontend user, I want authentication and bootstrap failures returned promptly rather than hidden behind repeated whole-flow attempts.
5. As a test author, I want explicit one-shot faults to drive retries while counters remain assertion-only.

## Implementation Decisions

1. Default every authentication, capability factory, API leaf, browser bootstrap, push, query, and telemetry-persistence operation to one attempt.
2. Keep frontend authentication, FrontendApi leaves, browser bootstrap, push, actor query, and telemetry persistence retry-free unless a later method-specific approval changes them.
3. Keep domain-owned deferred delivery retries and alarm resumption where the Repo architecture already defines ordering and terminal behavior.
4. Separate transient-error classification from retry application. A reusable predicate may identify reset and deleted-namespace errors, but callers opt into a schedule explicitly.
5. Require mutation retries to prove stable operation identity and idempotent replay at the receiving domain boundary.
6. Require read retries to prove that reacquiring a fresh stub and replaying the read has no externally visible side effect.
7. Do not retry schema validation, authorization denial, decoded domain rejection, invariant failure, or telemetry-persistence failure.
8. Use bounded schedules only. Every approved retry declares maximum total attempts and delay behavior at its owning call site or named domain policy.
9. Record every attempt as its own completed root when the prior attempt was lost or failed, linked with `retryOf`. Do not mutate the prior span into a later success.
10. Use explicit one-shot fixture controls for retry tests. Attempt counters observe behavior and never decide whether a fault occurs.
11. Do not add hidden retries inside API handlers, SystemWorker services, RPC-session construction, or traceable target proxies.

## Testing Decisions

1. Use a retry-policy inventory test or review gate covering every remaining `Effect.retry`, retry schedule, and retry helper application in frontend, dispatch-worker, system-worker, and deployment code.
2. For every approved retrying method, prove the exact retryable failure, non-retryable failures, total attempt bound, fresh-stub behavior where applicable, terminal error, and telemetry links.
3. For every retry-free frontend path, inject a transient reset once and prove exactly one attempt and immediate failure.
4. Preserve logger finalize DAG integration tests as prior art for explicit fault controls and domain-owned retry observations.
5. Prove mutation retry fixtures preserve the full encoded command shape and do not duplicate committed domain outcomes.
6. Grep fixtures to ensure no attempt counter or module-global first-call state controls a failure.

## Out of Scope

1. Adding a global retry middleware.
2. Infinite retries or unbounded exponential backoff.
3. Retrying domain validation and authorization failures.
4. Changing existing deferred Repo ordering or alarm ownership without a separate domain design.
5. Automatic browser reconnection or offline queue policy.

## Further Notes

1. The final grill must classify every current SystemApi retrying method as retry-free, safe read retry, idempotent mutation retry, or domain-owned deferred retry.
2. The final grill must classify deployment retries separately because deployment orchestration has different idempotency and time-budget constraints from request-serving APIs.
3. The final grill must choose exact schedules only after Cloudflare request and Durable Object time budgets are verified against current runtime constraints.
