# Handoff: QRK GitHub Activity and the Zerospin changes

**Original date:** 2026-10-01
**Status:** Superseded by Plan 037; reconciled and archived 2026-11-05.

## Reconciliation

1. The original handoff explored server-owned GitHub Activity workflows, a machine-backed module factory, background refresh/retry policy and content replication. It recorded unsettled proposals rather than an approved implementation contract. The [full historical handoff](https://github.com/morgs32/qrk.sh/blob/bafb6a4b154625c1de437e23b81863b2c4da986a/wiki/handoffs/2026-10-01-handoff-github-activity-and-zerospin-impact.md) remains available at a fixed commit; its vendor baseline, package names, source pointers and runtime assumptions are historical.
2. [Plan 037](../plans/037-plan-simple-provider-state-save.md#decision) superseded that workflow direction for GitHub Activity and the other provider forms: the module form fetches content, then submits one complete snapshot through App's existing `updateBrick` path. It explicitly removes background runners and persisted resolution machinery. Retry is another explicit Save; automatic refresh, retry queues and recovery jobs are outside that implemented scope.
3. [GitHubActivityForm](../../../apps/app/modules/githubActivity/GitHubActivityForm.tsx) implements the selected flow: normalize the profile input, call `getGitHubProfile`, validate profile identity and contribution data, then call `onSave` once. Cancellation or lookup/validation failure preserves the saved snapshot. [getGitHubProfile](../../../apps/api/modules/githubProfile/getGitHubProfile.ts) calls `scrapeGitHub` for each lookup; the old handoff's stale-cache concern does not describe the current path.
4. [Plan 021](../plans/021-plan-brick-forms.md) records the forms' historical implementation and completed verification. The [App module documentation](../../../apps/app/modules/README.md) owns current form and persistence boundaries. No new module factory, content replica, server workflow or durable retry capability is required by this retired handoff.
5. Automatic refresh could be proposed again as new product work. It has no active implementation commitment here. This reconciliation performs no code, provider, storage or deployment operation. Instagram account verification remains deferred in its [active handoff](../../handoffs/2026-10-13-handoff-instagram-username-verification.md).

## Remaining work

None for this superseded handoff.
