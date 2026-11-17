# Service-owned usernames

**Status:** Complete 2026-11-17. Implemented directly on main; the user performs manual verification independently.

## Agreed design

1. Users owns username claims and append-only UsernameFailure rows. Authenticated POST /api/usernames/assignment awaits the Service outcome. A rejected assignment records a failure row without changing the current claim.
2. Remove the username copy, UsernameStatus and synchronization from the current User release. The user requested a System reboot: establish independent initial declarations and replace the current local development System. The reboot overwrites the local history for the existing `sys_qrk_sh_1` identity; the logical System name remains `qrk-sh`.
3. Give the UI authenticated, owner-filtered Service reads. Domains records an external Users lookup; the first durably retained observation supplies the username for allocation even after a rename. Replays never repeat the lookup.
4. Domains durably delivers the allocated hostname or failure to User. Missing username leaves the Site unpublished with SiteFailure. Stable hostname reservations survive renaming and publication changes.

## Implementation and verification

1. Author simplified initial V1 declarations, a read-only Service Actor and session, the authenticated endpoint, and domain external work. Update existing UI consumers and existing tests.
2. Keep network operations outside authored command transactions. Example: `yield* operations.lookup({ payload })` records the Users lookup; the recorded external continuation allocates and records the User completion command atomically.
3. Endpoint example: authenticate first, derive owner identity, then `yield* api.executeServiceCommand(usersV1, { contractName: "assignUsername", payload })`; the endpoint never writes model rows.
4. Obtain approval of the concrete system.ts diff before modifying that registry. The user approved the fresh initial registry and overwriting the existing local System `sys_qrk_sh_1`. The requested local reboot replaces the selected QRK System history. Production, unrelated storage, credentials and provider state remain outside scope. No SDK change or release is part of this implementation.
5. Run scoped backend tests, Bricks import checks and App/Web builds. Use existing tests; add no test files or runners. User performs manual verification independently.
6. Reconcile glossary and live docs after implementation. Add an ADR only for an implemented hard-to-reverse, surprising decision with a real trade-off. Record results and archive when automated work is complete.

## Planned files

Legend: + add, ~ modify. The approved reboot replaces obsolete declarations with the current initial graph.

```text
qrk.sh/
  ~ AGENTS.md
  ~ apps/bricks/src/zerospin/models/
  ~ apps/zerospin/src/fresh/
  ~ apps/zerospin/src/services/
  ~ apps/zerospin/src/system.ts
  ~ apps/zerospin/test/
  ~ apps/app/app/
  ~ apps/app/zerospin/
  + apps/web/app/api/usernames/assignment/route.ts
  ~ apps/web/app/api/usernames/availability/route.ts
  ~ wiki/glossary.md
```

## Outcome

1. Users owns claims and append-only UsernameFailure rows. Settings uses the authenticated asynchronous endpoint and a read-only, owner-filtered Service session. The User username copy, UsernameStatus and synchronization declarations were removed.
2. Domains records a Users lookup and allocates from that observation. Completion and failure commands update the Site. The initial User, Users and Domains releases are all V1.
3. `zerospin dev --clean` replaced only `apps/zerospin/.wrangler/zerospin/dev-worker/sys_qrk_sh_1`. The configured backend is running at https://zerospin.qrk.localhost. Credentials, Clerk accounts, external objects and production were unchanged. Browser data was not deleted by the agent.
4. Updated the glossary, Web operational documentation and the existing stable-address ADR. No additional ADR was warranted.

## Remaining work

None. Per the user's daily choice, manual browser and connected-session verification happens on their own time.

## Verification

1. Final backend typecheck and all 37 existing/updated tests passed, including failed-assignment history, stable domain allocation and rename after observation.
2. App and Web builds, App typecheck, Bricks import check, and 14 focused Web tests passed after the final source integration. The CLI reported system spec accepted after the local reboot. A live authenticated SystemApi healthcheck and SystemSpec read confirmed `qrk-sh`, only V1 releases for all three owners, no User-side UsernameStatus, and Users-owned username/usernameFailure models. Browser session admission and real end-to-end username/domain UI behavior remain for the user’s manual verification.
