# Simple provider forms: fetch, then save state

Status: planned; implementation has not started in this side conversation.

## Decision

One Save fetches the module's content and submits one complete state through the
existing `updateBrick` command. The module form owns the lookup and temporary UI
state. App owns persistence. Storybook uses the same form with local state.

The old configure/complete workflow is disposable implementation detail. Remove
its background runners, public commands, request IDs, persisted resolution state,
and host dispatch plumbing from the current path. Do not replace them with a
server adapter, external continuation, workflow factory, or new generic framework.

This restores the provider-form interaction described in
[Plan 021](./021-plan-brick-forms.md). That plan's historical evidence and unrelated
Swatch/upload work stay intact. It supersedes the server-owned-workflow
recommendation in the earlier [research note](../research/github-repo-provider-command-ownership.md)
for this task: a durable provider workflow is not a requirement here.

## Scope

Apply this to GitHub Repo, GitHub Profile, GitHub Activity, Figma Thumbnail,
Instagram, Link, and Map Place. Image, Article, and Swatch keep their existing
save behavior. Keep layout/spec generation and its own revision handling outside
this cleanup.

Keep provider credentials and provider-specific fetching in their existing API
Worker operations. The module form calls those operations through the existing
RPC transport; it does not gain access to provider secrets. No Zerospin API change
is needed for the proposed current `updateBrick` path.

## Target interaction

1. The user edits a URL or chooses a place.
2. Save validates the input and starts one form-owned lookup.
3. The module validates the complete response and constructs `{ payload, data }`.
4. The form calls `onSave(state)` once. App stages `updateBrick` using its existing
   synchronous result contract; Storybook updates its local state.
5. A lookup/decoding failure leaves the saved Brick untouched and displays a local
   form error. A staging refusal also keeps the draft available for correction.

Annotated example of the intended GitHub Repo handler body, with surrounding
pending/cancellation setup omitted:

```ts
// 1. Fetch through the existing module-specific operation; persist nothing yet.
const response = await api.getGitHubRepo(normalizedUrl);
if (response._tag === "Left") {
  setSaveError(response.left.message);
  return;
}

// 2. The module validates the complete snapshot before asking App to save it.
const nextState = Schema.decodeUnknownSync(StateSchema)({
  payload: { url: normalizedUrl },
  data: response.right,
});

// 3. Cancel/navigation prevents a late response from staging a state change.
if (submission.signal.aborted) return;
const result = onSave(nextState);
if (result._tag === "Failure") {
  setSaveError(result.failure.message);
  return;
}

// 4. Clear the draft only after local command staging succeeds.
setRepository(null);
```

This is an illustrative handler body, not a proposed helper or factory. Decode
errors and thrown transport errors are caught by the form's submit handler and
displayed locally. Successful staging is not a separate promise of canonical
server completion; existing session error handling remains responsible for that.

## Implementation steps

1. **Remove workflow state from the current module interface.**
   - Keep module content as `{ payload, data }` and preserve the existing provider
     field shapes and defaults. Remove `resolution.requestId/status/error` from
     current module state, examples, and ordinary rendering.
   - Keep draft input, pending status, and errors local to the form. Disable
     duplicate submission while a lookup is active. Keep Cancel available.
   - Cancel/unmount/navigation invalidates the current local submission. Close or
     abort its RPC work where supported, and always check cancellation before
     `onSave`. Do not invent a guarantee that closing a request reverses remote
     provider work or uploaded assets.
   - New unconfigured Bricks remain the existing `null` placeholder state.
     Existing saved content without usable metadata stays untouched and shows
     an empty-content explanation until the user explicitly saves again. It
     must not restart a provider job on mount.

2. **Make the seven forms fetch complete state.**

   | Module | Existing provider operation | Module-owned behavior to retain |
   | --- | --- | --- |
   | GitHub Repo | `getGitHubRepo(url)` | URL normalization, complete repository snapshot |
   | GitHub Profile | `getGitHubProfile(url)` | Source identity validation, profile snapshot |
   | GitHub Activity | `getGitHubProfile(url)` | Contribution decoding and source identity validation |
   | Figma Thumbnail | `figmaBackend().getThumbnail(url)` | Document URL matching, valid nullable thumbnail fields |
   | Instagram | `getInstagramProfile(url)` | Username matching and the existing imported-image snapshot |
   | Link | `linkBackend().getPreview(url)` | Canonical response URL and complete preview |
   | Map Place | `googlePlacesBackend().getPlace(placeId)` | Selected place identity, finite coordinates and existing range checks |

   - Start with GitHub Repo as the concrete slice, then apply the same small
     interaction to the other six using their actual provider differences.
   - Use existing RPC methods directly in module-owned form logic. No new
     module registry callback, fetch-runner abstraction, or injected model factory.
   - A failed replacement preserves the old snapshot. Retry is another explicit
     Save, with no automatic retry queue or recovery job.

3. **Reduce host integration to `state`, `onSave`, and `onCancel`.**
   - Remove `configureCommand` and `onConfigure` from `IModule`, `makeModuleView`,
     the seven views/forms, App's `BrickDetail`, and `ModulePlayground`.
   - Remove the command-name lookup table, input-to-command decoding, and
     generated provider request ID from `BrickDetail`.
   - Reuse its existing `updateBrick` callback. The public persistence command
     remains `{ brickId, moduleId, state }`; no module-specific persistence command
     or separate `setBrickState` alias is added.
   - Remove generic resolution-state inspection from `makeModuleView`. Each
     module owns content rendering; generic null-state placeholder handling stays.
   - Keep App and Storybook on the same form interface. Replace persisted
     Resolving/Failed story fixtures with form-local pending/error scenarios where
     useful; do not add a test harness or fake workflow lifecycle.

4. **Delete the background provider workflow.**
   - Delete all seven `start*Resolution.ts` runners and their provider subscription,
     `navigator.locks`, attempted-request sets, and completion callbacks.
   - Remove those runners from `startLibrarySessionWork`. Retain
     `startBrickSpecGeneration` and any session ownership still required by it.
     Do not delete shared session lifetime machinery merely because providers
     stop using it.
   - Remove all seven configure/complete pairs from the current web actor and
     browser session. Remove dead current wiring and imports in their entirety.
     Construct a complete replacement actor when removing capabilities: the
     existing actor-update API merges maps and cannot revoke entries with `{}`.
   - Retain historical declarations only where existing admitted history or
     retained releases require them. They do not justify retaining current UI
     dispatch, background runners, or a second public write path.

5. **Keep data and unrelated behavior intact.**
   - This permission to discard machinery does not authorize a storage reset,
     deleting history, or rewriting stored Brick rows. Existing successful
     snapshots remain useful content; legacy resolution fields can remain in
     stored documents while current readers ignore them. An explicit future Save
     records the new complete state through `updateBrick`.
   - Do not mutate historical module codecs that retained completion payloads
     reference. Version the changed module definitions as needed, and keep
     historical command validation pinned to its historical module definitions.
   - `Brick.state` is already JSON with an unknown schema at the model boundary.
     Removing module workflow fields alone does not justify new Brick, Placement,
     Page, Wall, or unrelated contract versions. Evolve only the actual changed
     command/actor/release bindings needed for the current public interface.
   - Preserve `updateBrick` validation, Brick identity, layout/specs, and its
     existing state revision/spec-generation invalidation behavior. Those
     revisions serve separate functionality and are not provider job machinery.
   - No automatic refresh, resume after closing the editor, new durable queue,
     provider-provenance system, provider rewrite, SDK release, or deployment.
   - Update App, Library, and backend documentation to describe fetch-then-save.

## Expected outcomes

1. One successful Save performs one provider lookup and stages one `updateBrick`.
2. Invalid input, provider failure, or malformed response stages no state update.
3. Failed replacement, Cancel, or leaving the editor retains the saved snapshot.
4. Closing the form ends its responsibility for the lookup. Reopening does not
   resume an old job; the user can explicitly Save again.
5. Current consumers know no configure/complete pair, provider request ID, or
   persisted resolution lifecycle. Normal Zerospin persistence remains.

These outcomes describe the implementation target, not completed verification.
No tests, builds, lint/format checks, runtime probes, or browser verification runs
are scheduled by this planning task. No implementation code is changed here.

## Source anchors

- [Existing fetch-then-save decision](./021-plan-brick-forms.md)
- [GitHub Repo form](../../apps/library/modules/githubRepo/GitHubRepoForm.tsx)
- [GitHub Repo state](../../apps/library/modules/githubRepo/githubRepoV1.ts)
- [Current browser resolver](../../apps/library/modules/githubRepo/startGithubRepoResolution.ts)
- [Module form contract](../../apps/library/lib/types.ts)
- [Module rendering/form glue](../../apps/library/make/makeModuleView.tsx)
- [App form admission](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/BrickDetail/BrickDetail.tsx)
- [Storybook playground](../../apps/library/lib/ModulePlayground.tsx)
- [Current session work](../../apps/app/zerospin/startLibrarySessionWork.ts)
- [State-save command](../../apps/zerospin/src/aggregates/user/contracts/brick/UpdateBrickV2.ts)
- [Brick storage shape](../../apps/library/make/makeBrickModel.ts)

## Remaining work

1. Implement steps 1–5 after plan approval. Only this plan was written.
2. Resolve any newly discovered SDK friction by proposing an upstream change
   before implementing it; do not add a consumer workaround. None is required
   by the interface planned above.
