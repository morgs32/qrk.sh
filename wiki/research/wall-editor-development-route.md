# A smaller development route for the wall editor

Research date: 2026-10-21. Reviewed [PR #16](https://github.com/morgs32/qrk.sh/pull/16), pinned to `7a34e20450d7238c6480cfe03ccc9efd2cbb5711`, against its base `36b2f13e35bfa5ed981cd56eb2e7309bd1068994`. The original research was source-only, with no product changes or verification runs; PR #16 remains open.

The original implementation began as a read-only sibling development route,
then gained palette additions and Placement/Stack moves with DOM drag
registrations. That route has now been retired: its canvas lives in production
[PagePreview](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PagePreview.tsx).
The current follow-up below records that adoption. The original broader editor
discussion and commit-linked PR findings remain dated research.

## Current composition follow-up: Plan 042

Implemented 2026-10-22 without verification. Actual
[UserLayout](../../apps/app/app/[username]/layout.tsx) now owns Clerk gating and
connected initializer readiness for all username descendants. Actual
[SiteLayout](../../apps/app/app/[username]/site/[siteId]/layout.tsx) remains a
shared height shell.

Production now composes the editor directly in actual
[PageLayout](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx).
PagePreview adopts the development canvas's direct Wall query, layout projection,
drop resolution and DOM drag registrations inside the existing WallBreakpointPane
and SiteHeader chrome. One fitting URL-selected frame mounts this canvas;
WallPlacement retains editing/deletion, and the Modules drawer supplies draggable
catalog previews. The former `/dev/page/...` route is deleted and the route tree
regenerated. There is one App canvas. Both custom wall providers/contexts,
BrickCardStyleContext and WallPreviewViewport are removed. App uses saved
`Site.cardStyle` directly; only Site Settings Save changes that appearance value.
Shared previews receive ordinary boolean props, while ModulePlayground retains
its local visual Cards control.

PageLayout directly owns the preview scroll region, 50dvh trailing space while
the drawer is open or 56px while closed, scroll anchoring/clamping during drawer
changes and resizing, and floating toolbar positioning with reduced-motion
handling. The production URL owns `?breakpoint=md`, and
App's Zustand store holds only measured available width. `useBreakpointGuard`
measures the mounted viewport and replaces a missing/non-fitting URL choice
with the largest fitting breakpoint, clearing insertion; below 360px it shows
insufficient space without a fallback Wall. Settings forms own fields and
Save/Cancel keyed by Site/Page ID; Storybook owns its width and memory-router
breakpoint locally. Its Wall Editor story remains a controlled WallTree fixture;
it does not mount PagePreview's adopted canvas. Models, commands and module
behavior keep their existing owners. See
[Plan 042](../archive/plans/042-plan-route-layout-ownership.md). The commit-linked
PR findings below still describe their original revisions and do not constitute
verification of this change.

## Original recommendation (2026-10-21)

Keep the existing editor available and start the new editor in a small sibling development route at `/<username>/site/<siteId>/dev/page/<pageId>/<breakpoint>`. The route renders one selected breakpoint and the existing page/wall data plainly, before adding the chooser, insertion controls, drawer, animation, or drag-and-drop. It reuses the existing connected user session while bypassing the old page editor layout. The route shape follows the current TanStack file router and its username/site ancestors. [Routing configuration][routing-config], [username route][username-route], [site route][site-route], [TanStack route nesting][router-concepts].

The goal should be clear ownership and small components, rather than the number of providers removed. `UserUI.useSession()` supplies the data session; it does not decide who owns selected Brick, pending insertion, drawer visibility, or drag feedback. React recommends one owner **per piece of state**, rather than putting every kind of state in one component. [UserUI][user-ui], [React state ownership][react-state].

## What is wrong with PR #16?

1. **Removing the provider creates three owners of the same action.** The PR stages `addBrick` and then navigates to the new Brick from `WallEditor`, the module list, and module detail. The latter two also repeat insertion JSON decoding, schema decoding, active-Wall lookup, and target matching. Before the PR, the provider owned the add handler and exposed it to those consumers. These are newly duplicated responsibilities, not a requirement imposed by `UserUI`. [PR editor][editor-actions], [PR module list][module-list], [PR module detail][module-detail], [original provider][old-provider-actions].

2. **Combining the components changes drag-registration lifetime.** The new `WallEditor` reconstructs `sections` and its command callbacks in its own render. Its drag effect depends on those values. The same component updates local indicator state during drag; the effect cleanup clears that indicator and the `data-dragging` attribute. Consequently, indicator renders now invalidate the entire registration effect. Previously, `WallTree` received `sections` and callbacks from its parent, so its own indicator renders did not recreate those inputs. React runs old cleanup before setup when dependencies change. This is a source-derived lifecycle problem, not an observed browser failure. [PR projection and state][editor-projection], [PR monitor and cleanup][editor-monitor], [original WallTree inputs][old-tree-inputs], [original cleanup][old-tree-cleanup], [React Effect lifecycle][react-effect].

   Re-registration does **not** establish that a drag must abort: Atlassian explicitly reconciles targets and draggables removed and re-added on the same DOM element. The concern here includes QRK's own cleanup resetting feedback and the wall monitor being recreated. Monitors are independent registrations, and their ordering/lifetime deserves deliberate ownership. [Atlassian reconciliation][dnd-reconciliation], [Atlassian monitors][dnd-monitors].

3. **The editor is still tied to the production route.** It reads params/search from the exact production route ID and navigates to exact production child paths. Moving it into App does not make it portable to another route. Storybook still constructs a synthetic production-shaped router to satisfy that coupling. Most of this coupling existed in the original provider; the PR carries it into the new component. [PR route dependencies][editor-route], [PR Storybook router][story-router], [original provider route dependencies][old-provider-route].

4. **The old adapter remains, just in a larger component.** Saved rows become another nested object tree carrying `ReactNode` content, empty-string Brick IDs, and fallback widths before reaching the layout components. The PR also reverses the `ComponentProps` dependency chain through the Library components. These types are not inherently invalid, but they preserve the adapter boundary without establishing a simpler ownership boundary. The row-to-view projection and fallbacks were inherited; the new bottom-up type chain is relocation fallout. [PR projection][editor-projection], [original projection][old-projection], [PR Section][section-props], [PR Row][row-props], [PR Placement][placement-props].

None of this means every Effect or context is a workaround. Registering a DOM drag target in a ref-owning component's Effect is the documented Atlassian pattern. Context can legitimately supply distant consumers of shared UI state. A hook that creates local UI state would create separate state when called in three places; a hook reading `UserUI` can still read the same existing external session. [Atlassian drop targets][dnd-targets], [React reducer/context][react-context], [React custom hooks][react-hooks], [UserUI][user-ui].

## Options

| Approach | What it buys | Main cost | Recommendation |
| --- | --- | --- | --- |
| Keep the existing provider and make a small cleanup | Retains one add-action owner and the existing parent/child drag-state boundary | Keeps the existing route, draft-store and drawer coupling | Reasonable if the goal is only a safe rename/move; removing context alone is not sufficient justification. [Original provider][old-provider-actions], [original WallTree][old-tree-inputs] |
| Build a small sibling development route | Can establish explicit inputs and ownership without carrying the old page editor shell into the experiment | Temporarily maintains two editor paths; each added behavior needs a deliberate cutover decision | Preferred for starting fresh. Reuse models, commands, module components and session lifecycle rather than copying all 633 lines. [PR editor][editor-route], [existing session owner][session-owner], [routing configuration][routing-config] |
| Develop only in Storybook | Existing `MockInitializer` supplies a real local session and seeded resources | The story has its own router/harness and does not mount the connected app's `UserSessionWork` | Useful alongside the route, not evidence of identical connected lifecycle behavior. [Story harness][story-harness], [connected session work][session-work] |

## Where the new route should live

The current page route mounts `PageLayout`, which mounts `UserLayout`, `SiteLayout`, and `EditorLayout`. Its index page returns `null`: the editor comes from the parent layout. A child at `/page/$pageId/dev` would therefore inherit the old editor rather than start independently. [Page route][page-route], [PageLayout][page-layout], [page index][page-index].

Use the ordinary sibling route file `apps/app/routes/$username.site.$siteId.dev.page.$pageId.$breakpoint.tsx`. It can inherit the username's connected session and the site's height shell while skipping `PageLayout`. TanStack also supports non-nested routes when URL nesting must differ from layout nesting, but that machinery is unnecessary for this proposed sibling URL. [Username layout][username-layout], [site shell][site-shell], [TanStack route nesting][router-concepts].

Two inherited boundaries still need explicit treatment:

- **Authentication/readiness:** `ZerospinUserProvider` can render its children without a `UserUI` provider while signed out; the existing `UserLayout` prevents session readers from mounting in that state. The new route should retain that gate, or an equivalent gate, before rendering session consumers. It must reuse the existing initialized session rather than mount another connected initializer. [Provider branches][session-owner], [UserLayout][user-layout].
- **Page ownership:** `SiteRootLayout` is only a height shell. The separate `SiteLayout` initializes global site/page draft stores and couples the old editor to them. Query the requested site and page directly and require the page's `siteId` to match the requested site; do not import the old draft layout merely to obtain a session. [Site shell][site-shell], [SiteLayout][site-layout].

The initial route implements a development-only `beforeLoad` guard; a hidden navigation link alone would not isolate the route.

## Proposed first slice

```text
Existing username session owner
  Initializer -> UserUI(session)
    Existing site height shell
      Development page route
        Development-only guard + existing UserLayout auth gate
        Direct site/page ownership check
        One explicit breakpoint
        Small app-owned editor
          Existing Wall -> Section -> Stack -> Row -> Placement data
          Existing module component for each Brick
```

This diagram describes the proposed responsibilities, not new providers or a generic controller API. The persisted hierarchy already exists, and Walls are unique by `(pageId, breakpoint)`. The first slice should take explicit page/breakpoint inputs; production route IDs and URL parsing should stay at the route boundary. Selection, if introduced, means the Brick form is open; DOM focus and drag feedback remain separate. [Wall model][wall-model], [PR nested query][editor-query], [PR selection and focus][editor-focus].

After agreeing on that small slice:

1. Add one insertion interaction and one module chooser beside the editor. Both click and drag entry points should reach one existing-command handler, rather than reproducing the action in every route. Keep a pending insertion as one UI value; decide whether it needs a URL before serializing it. If URL persistence is required, TanStack supports typed search validation. Moving decoding from components to a route is a proposed trust-boundary change and needs explicit agreement under this repo's rules. [Duplicated actions][editor-actions], [TanStack search validation][router-search].
2. Add drag-and-drop with DOM registrations owned near the elements they register, and one deliberate wall-level drag monitor that dispatches existing commands on drop. Keep rapidly changing indicator state from tearing down the whole wall registration. This applies Atlassian's ref/Effect pattern; it does not require a new drag library or a generic drag framework. Do not treat blanket `useMemo`/`useCallback` as the architectural repair: React describes memoization as an optimization, not a semantic lifetime guarantee. [Atlassian drop targets][dnd-targets], [Atlassian monitors][dnd-monitors], [React memoization][react-memo].
3. Mount the same small editor under the existing connected `UserUI` in the app and `MockInitializer`/`UserUI` in Storybook. Let their outer harnesses differ. An editor with explicit inputs and selection callbacks would not require a fake production URL simply to read its page ID; use a memory router only for stories whose subject includes routing. Storybook documents provider decorators for this purpose. [Existing mock harness][story-harness], [Storybook providers][storybook-providers].
4. Bring back drawer, image upload, breakpoint transitions, and settings only when the new editor needs them. Replace the production composition and delete superseded glue after agreeing on the cutover. Do not first reproduce every old feature merely to call the result fresh. The existing editor layout currently owns all of those concerns together. [Existing editor layout][editor-layout].

## Data and limits

Route isolation is not data isolation. Reusing the connected `UserUI` means existing commands act on real rows for the explicitly selected page. This proposal needs no aggregate upgrade, new model versions, data copying, storage reset, or automatic seeding/cleanup. Persisted edits should keep using the registered commands. For disposable fixtures, the existing Storybook `MockInitializer` harness seeds a separate local session; sharing its editor does not require sharing that session instance. [Current command path][editor-actions], [mock resources][mock-resources], [mock harness][story-harness], [connected session owner][session-owner].

The findings are based on source inspection and primary documentation. They do not establish rendered behavior, drag behavior, runtime readiness, or compatibility of a proposed new route. Official framework documentation describes the current concepts; this note does not assume that a newer API from those docs is installed. No verification runs were performed.

[routing-config]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/vite.config.ts#L15-L22
[username-route]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/routes/%24username.tsx#L1-L14
[site-route]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/routes/%24username.site.%24siteId.tsx#L1-L14
[router-concepts]: https://tanstack.com/router/latest/docs/routing/routing-concepts
[user-ui]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/zerospin/UserUI.ts#L1-L6
[react-state]: https://react.dev/learn/sharing-state-between-components#a-single-source-of-truth-for-each-state
[editor-actions]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/WallEditor.tsx#L91-L151
[module-list]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/Modules/Modules.tsx#L39-L98
[module-detail]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/%28drawer%29/%28bricks%29/modules/%5BmoduleId%5D/page.tsx#L72-L124
[old-provider-actions]: https://github.com/morgs32/qrk.sh/blob/36b2f13e35bfa5ed981cd56eb2e7309bd1068994/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/WallEditorProvider.tsx#L81-L99
[editor-projection]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/WallEditor.tsx#L154-L220
[editor-monitor]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/WallEditor.tsx#L490-L546
[old-tree-inputs]: https://github.com/morgs32/qrk.sh/blob/36b2f13e35bfa5ed981cd56eb2e7309bd1068994/apps/app/modules/lib/wall/WallTree.tsx#L25-L71
[old-tree-cleanup]: https://github.com/morgs32/qrk.sh/blob/36b2f13e35bfa5ed981cd56eb2e7309bd1068994/apps/app/modules/lib/wall/WallTree.tsx#L393-L397
[react-effect]: https://react.dev/reference/react/useEffect
[dnd-reconciliation]: https://atlassian.design/components/pragmatic-drag-and-drop/core-package/reconciliation/
[dnd-monitors]: https://atlassian.design/components/pragmatic-drag-and-drop/core-package/monitors
[editor-route]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/WallEditor.tsx#L44-L97
[story-router]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/components/WallEditor.stories.tsx#L225-L245
[old-provider-route]: https://github.com/morgs32/qrk.sh/blob/36b2f13e35bfa5ed981cd56eb2e7309bd1068994/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/WallEditorProvider.tsx#L24-L30
[old-projection]: https://github.com/morgs32/qrk.sh/blob/36b2f13e35bfa5ed981cd56eb2e7309bd1068994/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/WallEditorProvider.tsx#L113-L170
[section-props]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/modules/lib/wall/WallSection.tsx#L4-L10
[row-props]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/modules/lib/wall/WallRow.tsx#L4-L10
[placement-props]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/modules/lib/wall/WallPlacement.tsx#L6-L13
[dnd-targets]: https://atlassian.design/components/pragmatic-drag-and-drop/core-package/drop-targets
[react-context]: https://react.dev/learn/scaling-up-with-reducer-and-context
[react-hooks]: https://react.dev/learn/reusing-logic-with-custom-hooks#custom-hooks-let-you-share-stateful-logic-not-state-itself
[session-owner]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/components/ZerospinUser.tsx#L27-L77
[session-work]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/components/ZerospinUser.tsx#L80-L97
[story-harness]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/components/WallEditor.stories.tsx#L225-L275
[mock-resources]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/components/WallEditor.stories.tsx#L34-L165
[page-route]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/routes/%24username.site.%24siteId.page.%24pageId.tsx#L1-L16
[page-layout]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/layout.tsx#L1-L15
[page-index]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/page.tsx#L1-L3
[username-layout]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/layout.tsx#L1-L7
[site-shell]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/layout.tsx#L1-L10
[user-layout]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/UserLayout.tsx#L1-L10
[site-layout]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/SiteLayout.tsx#L23-L100
[wall-model]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/zerospin/src/aggregates/user/models/wall/WallV1.ts#L5-L11
[editor-query]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/WallEditor.tsx#L55-L68
[editor-focus]: https://github.com/morgs32/qrk.sh/blob/7a34e20450d7238c6480cfe03ccc9efd2cbb5711/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/WallEditor.tsx#L548-L582
[router-search]: https://tanstack.com/router/latest/docs/guide/search-params#validating-search-params
[react-memo]: https://react.dev/reference/react/useMemo#preventing-an-effect-from-firing-too-often
[storybook-providers]: https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-providers
[editor-layout]: https://github.com/morgs32/qrk.sh/blob/36b2f13e35bfa5ed981cd56eb2e7309bd1068994/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/EditorLayout.tsx#L34-L131
