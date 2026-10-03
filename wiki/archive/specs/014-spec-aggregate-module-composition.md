# Aggregate and session module composition

**Date:** 2026-09-26
**Status:** Implemented

## Problem Statement

## Solution

These snippets illustrate declaration placement; existing aggregate identity,
version, actor, and guard requirements still apply.

## User Stories

## Implementation Decisions

## Testing Decisions

## Out of Scope

1. Changing the service factory's version-keyed `module` interface. This
   exclusion does not apply to service sessions, which are in scope.
2. Redesigning Shopping checkout or replacing its payment lifecycle with the
   separate reusable purchase example. Its aggregate call sites still receive
   the required interface migration.
3. Introducing module namespaces, override precedence, module-level write
   ownership, or runtime module execution.
4. Storage migrations, compatibility aliases, and acceptance of the superseded
   singular aggregate or browser-session `module` input.

## Further Notes

The user approved the flat declaration and multiple-module design in chat.
Implementation and verification are recorded in [Plan 014](../plans/014-plan-aggregate-module-composition.md). The shopper composition example refers to the existing reusable
purchase/fulfillment consumer, which already demonstrates both domain modules.
The user also approved extending the same composition interface to aggregate
and service browser sessions while preserving browser restrictions.
