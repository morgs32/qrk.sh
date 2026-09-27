# Durable actor listeners

**Date:** 2026-09-24
**Status:** Superseded by [Spec 012](012-spec-aggregate-state-machines.md).

This document records the former listener design. Spec 012 replaces its
declaration, provenance, and persistence decisions with aggregate state
machines and activation records.

## Problem Statement

Actors need asynchronous server reactions that continue after browsers disconnect,
without performing external work inside command programs or exposing server-only
commands to clients.

## Solution

1. Register named `makeListener` declarations on existing aggregate actors.
2. Observe one contract; run an Effect with `{ db, on, contracts }`; return one
   declared output command or `null`. Contract declarations supply result schemas.
3. Keep browser-callable contracts and listener output permissions separate.

## User Stories

1. A human plays X; a listener reads the selected game, chooses a computer move,
   and returns playO through normal guards without needing a computer actor.
2. Closing the browser does not cancel an initialized listener's work.
3. Restarting retries unfinished work without changing a saved output.

## Implementation Decisions

1. Trigger on successful matching commands from any actor that change selected
   state, including resources entering or leaving the selection.
2. First registration establishes a durable starting position after catch-up;
   earlier commands do not trigger listeners. Registration precedes first admission.
3. Read current selected state at the start of each attempt. Serialize reactions
   per listener and actor instance; projection and other listeners remain independent.
4. Record pending work atomically with projection. Reuse outbox/alarm recovery,
   adding a page-size option and per-listener row filter while retaining the existing default of 64.
5. Persist the program result before delivery. Store flat command fields or explicit
   null completion. Interrupted computation may repeat; saved output delivery may
   repeat under its stable command ID without repeating computation.
6. Derive output identity from the triggering command, full actor key, and listener
   name. Enforce server provenance through saved-output references; do not trust
   caller-provided listener names. Carry only the actor's selection claims.
7. Apply contract and owner guards. Retain terminal rejection and finish that
   reaction; retry infrastructure failures without recomputing the saved command.
8. Each move computes game outcome. No asynchronous endGame step is required.
9. Fixed schemas require empty storage under the pre-release hard cutover policy.

## Testing Decisions

1. Typecheck observed payloads and permitted output construction, including invalid
   payloads, undeclared outputs, and command arrays.
2. Test selection filtering, null completion, ordered execution, independent
   listeners, initialization, projection progress, interruption, and alarm recovery.
3. Exercise real server admission and materialization, forged provenance rejection,
   listener-only permissions, stable delivery, and terminal guard rejection.
4. Use deterministic injected move generation. No Playwright or in-browser testing.

## Out of Scope

1. Real LLM provider integration, multiple outputs per reaction, and exactly-once
   execution of external calls before result persistence.
2. Historical listener backfills, separate computer actor initialization, and
   compatibility migrations.
