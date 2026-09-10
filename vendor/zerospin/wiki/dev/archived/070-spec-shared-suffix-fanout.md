# Shared-suffix fanout design

**Date:** 2026-09-06
**Status:** Approved for planning

## Problem Statement

Fanout currently queries commands separately for each subscriber and derives its
deliverable tip from a table maximum. This duplicates reads and prevents owners
from defining a finalized prefix over a table that also contains unresolved
commands. Unserialized drains can overwrite cursor progress or enrollment resets.

## Solution

Each serialized drain obtains one owner-defined deliverable suffix and shares it
across oldest-first subscriber pages. The queue owns subscriber persistence,
scheduling, acknowledgements, and alarm leases. Owners define command selection.

## User Stories

1. As a fanout owner, I want one suffix read shared across subscribers so delivery
   does not repeat the same command query for each subscriber.
2. As ACC, I want to define admitted and finalized suffix queries independently
   so unresolved commands prevent finalized delivery from crossing their position.
3. As a subscriber, I want only commands after my cursor, with partial progress
   retained and failed delivery retried without blocking other subscribers.
4. As a re-subscribing receiver, I want my cursor reset preserved after outstanding
   acknowledgements complete.
5. As a queue owner, I want configurable concurrency and alarm-driven continuation
   without a separate pending-work API.

## Implementation Decisions

1. Replace `fanoutTable` with `getSuffix(afterIndex)`, returning an Effect of a
   readonly array. Infer `ROW` from its return and propagate it to `getIndex`,
   `deliver`, and queue-derived row typing. `getIndex(row)` supplies the index
   without reshaping source rows.
2. Owners return the ordered, contiguous, deliverable prefix strictly after the
   cursor. They own the query limit, initially a named 64-command constant.
   Finalized queries stop before unresolved occurrences and retain rejections.
3. Optional `concurrency`, default 100, is a positive integer controlling both
   subscriber page size and concurrent deliveries.
4. Serialize drains and enrollment per queue instance. Schedule subscription
   draining only after enrollment releases the lock. Preserve existing subscription
   parameters and delivery acknowledgement shape; remove fanout `hasPending`.
5. Hold the alarm lease before reading. SQL pages order by normalized cursor
   (`null` means zero), then subscriber primary key. Fetch a suffix once from the
   first page's oldest cursor. Empty subscribers or an empty suffix release the
   lease and return.
6. For a nonempty suffix, offer each eligible subscriber only rows above its cursor.
   Retain original page boundaries for keyset pagination and remember attempted
   identities, since acknowledgements can move them later in the ordering.
   Exclude attempted identities in SQL before applying the subscriber page limit.
7. Attempt each subscriber once per drain. Persist advancing acknowledgements;
   partial progress, null, unchanged, or regressed acknowledgements leave remaining
   work for the next drain. Never regress a cursor from delivery.
8. Continue later pages after individual delivery failures, including thrown
   defects. The queue persists each failure in the subscriber's existing
   `lastDeliveryFailure`; owners return failures instead of swallowing them.
   Clear the field on acknowledged progress, preserving it on no progress.
   Preserve successful progress and return the first failure in attempt order
   after attempting all eligible subscribers. Cancellation remains interruptible.
   Query or persistence failures retain the alarm lease. If failure persistence
   itself fails, return an error containing both failures; storage failure cannot
   guarantee a saved diagnostic.
9. Every nonempty drain retains its lease and returns without fetching another
   suffix. The next alarm continues or releases the lease on an empty drain.
10. Migrate all five current fanout callers without changing physical schemas.
    Preserve owner wakeups. Plan 069 retains responsibility for ACC's unified table
    and must wake finalized fanout when finalization advances without new admission.

## Testing Decisions

1. Use existing SQLite-backed fanout queue tests as the primary behavioral seam.
2. Cover shared reads across pages, unequal/tied/null cursors, concurrency, slicing,
   complete row preservation, partial/no progress, failures, and alarm continuation.
3. Cover serialized drains, cursor resets, empty subscribers, query failure, and an
   owner callback that stops at unresolved commands and resumes after finalization.
4. Use TypeScript assertions and system-worker typechecking to verify row inference.
   Run existing fanout subscriber and chain tests through Nx.

## Out of Scope

1. ACC's unified commands-table implementation and the per-view pipeline in Plan 069.
2. Physical schema changes, persistence migrations, compatibility paths, and outbox APIs.
3. New runtime boundaries, public delivery RPCs, or shared query abstractions.

## Further Notes

1. Serialization is per queue, not across different queue instances on one owner.
2. The one-suffix limit bounds command work, not the number of subscriber pages.
3. Subscription may wait for an active drain's RPC deliveries. Receivers must not
   synchronously re-subscribe to that same queue while handling its delivery.
