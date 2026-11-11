# Article autosave

Studio saves the latest changed Article snapshot after one second without edits.
Content changes drive the timer. Focus can move among the title, subtitle, body,
and formatting controls while writing continues. CKEditor also listens for
document changes and defaults to a one-second delay. [CKEditor autosave](https://ckeditor.com/docs/ckeditor5/latest/features/autosave.html)

Studio flushes before replacing the current Wall or leaving the Page. Publication
flushes first so it captures the latest staged text. The editor also attempts a
flush when its tab becomes hidden, the last lifecycle event Chrome recommends
using to save application state. [Chrome page lifecycle guidance](https://developer.chrome.com/docs/web-platform/page-lifecycle-api#developer-recommendations-for-each-state)

`updateBrick` stages a single snapshot of the title, subtitle, and body for the
shared Brick. The ready session owns offline queuing, delivery, and reconciliation.
Retry and Discard address locally refused staging. Later admission and execution
failures use the session error path. [Brick update contract](../../apps/zerospin/src/aggregates/user/contracts/brick/UpdateBrickV3.ts)

## Local verification on November 10, 2026

1. Phase 1 and 2 browser checks covered blank inline fields, focus opening the
   drawer, preservation on drawer close, body-first autosave after reload, and
   immediate breakpoint changes, Page exit, and publication. Phase 3 exercised
   Retry and Discard in Storybook and verified blocked transitions and publication
   using a simulated staging refusal in the local App. [Phase 1](https://github.com/morgs32/qrk.sh/pull/83) · [Phase 2](https://github.com/morgs32/qrk.sh/pull/85) · [Phase 3](https://github.com/morgs32/qrk.sh/pull/86)
2. Tab-only offline emulation left the SharedWorker connected, so canonical
   state could still advance. For the controlled check, temporary instrumentation
   set the worker’s offline signal as well, and the configured local Zerospin
   service was stopped to close the live socket. The ready App staged a subtitle
   edit that survived a breakpoint remount. A read-only `AggregateVersionRepo`
   query still returned revision 10 and the previous subtitle.
3. The same local service restarted with retained storage. After restoring
   networking and the worker’s online signal, revision 11 contained the queued
   subtitle without a manual save retry. It survived a normal online reload.
   The temporary instrumentation was removed. This exercised a mounted session
   and an offline Wall remount. The App’s production preview is the documented
   setup for a cold offline reload. [App offline verification setup](../../apps/app/README.md#offline-loading-and-updates)
4. The read-only Article preview mounted no editor. Swatch’s header Save remained
   associated with its native form, and Cancel restored its previous value.
