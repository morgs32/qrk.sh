# Production editor composition

**Status:** implemented October 22, 2026. Production route ownership, form-local settings, provider removal, and URL-owned breakpoints are implemented. No verification was run, as explicitly requested by the user. Stored data, models, and commands were not changed.

**Implemented follow-up, October 22:** the subsequent user instruction removes the remaining card-style context/local App preview override and WallPreviewViewport, adopts the dev canvas inside the production browser chrome, and removes the dev URL. This supersedes the initial plan's retention of those components and preservation of a separate development route. The original scope below is retained as its implementation record; the follow-up outcome records the current composition.

## Original Plan 042 scope

1. Rebuild production composition around the actual route layouts: username owns authentication and session readiness; site owns its shell; page owns its editor.
2. Settings forms own unsaved fields. Save submits existing commands. Cancel or navigation away discards changes. Identity is the actual `siteId` or `pageId`.
3. Delete the superseded authentication and draft-initialization wrappers, global settings stores, separate EditorLayout, WallEditorProvider/WallEditorContext, and WallViewportProvider/context after replacing their responsibilities. No `AuthenticatedContent`, `PageDrafts`, synthetic `draftId`, or renamed replacement providers.
4. Keep the development page's working wall query, add/move commands, drag registrations, breakpoint handling, and rendering intact. It remains independent of the production editor beneath the shared username session and site shell.
5. Keep models, commands, brick modules, shared wall drag/rendering behavior, the concrete initializer API from [Plan 040](040-plan-concrete-session-initializers.md), and App/Storybook upload ownership from [Plan 041](041-plan-host-owned-upload-functions.md). The new App-owned Zustand store holds only measured available width. No SDK changes, data resets, or dev-to-production canvas migration.

## Actual route owners

App uses TanStack routes. These `app/` files are components imported by route modules; their directory names alone do not register routes.

| Owner and defining file | Route module | Responsibility |
| --- | --- | --- |
| `UserLayout`: `app/[username]/layout.tsx` | `routes/$username.tsx` | Clerk loading/sign-in redirect, connected initializer, ready UserUI and descendants |
| `SiteLayout`: `app/[username]/site/[siteId]/layout.tsx` | `routes/$username.site.$siteId.tsx` | Shared height/overflow shell; no settings initialization or page dependency |
| `PageLayout`: `app/[username]/site/[siteId]/page/[pageId]/layout.tsx` | `routes/$username.site.$siteId.page.$pageId.tsx` | Production page lookup, title, upload host, breakpoint guard/measurement, preview, toolbar, drawer and Outlet |

1. Paths in the table are relative to `apps/app/`. Preserve route IDs, URL pathnames, existing insertion validation/refusal, and Outlet nesting. Extend the existing production page search schema with `breakpoint`, for example `?breakpoint=md`. Update component bindings without renaming route modules or regenerating the route tree. The dev URL's existing breakpoint path segment is unchanged.
2. Dashboard and dev content inherit auth/readiness from UserLayout. The dashboard Header waits with the rest of username content.
3. The dev route is `site/$siteId/dev/page/$pageId/$breakpoint`, outside the production PageLayout. It must not acquire production page queries, settings state, or editor providers.

## Initial React tree, before the follow-up

The authenticated, initialized branch is shown. Dashboard, production page, and development page are alternative branches.

```text
UserLayout                              [username]/layout.tsx
└── ConnectedAggregateInitializer        key={user.id}; existing initializer inputs
    └── UserUI                          only after initializer isLoaded
        ├── UserSessionFailures         existing failure subscription
        └── Route children
            ├── DashboardLayout
            │   ├── Header
            │   └── Dashboard content
            └── SiteLayout              site/[siteId]/layout.tsx: shared shell
                └── Route children
                    ├── PageLayout      key={pageId}; calls useBreakpointGuard()
                    │   └── BrickCardStyleContext
                    │       └── SWRConfig(uploadImage)
                    │           └── Existing preview + drawer
                    │               ├── WallPreviewViewport: measured DOM remains mounted
                    │               │   └── MainColumns → PagePreview → WallTree
                    │               ├── DrawerHeader: navigation/publishing
                    │               └── Outlet
                    │                   ├── SiteSettings key={siteId}
                    │                   ├── PageSettings key={pageId}
                    │                   └── Existing module/brick routes
                    └── DevelopmentPage: existing working wall implementation
```

The App-owned width store is consumed directly through Zustand. The URL supplies the current breakpoint. Neither needs a React provider.

## Authentication and readiness

1. Put the Clerk check and existing initializer composition directly in actual UserLayout. Call `useUser` and `useAuth` unconditionally before auth returns. Return null while Clerk loads; return `RedirectToSignIn` when signed out.
2. Move ConnectedAggregateInitializer composition from `components/ZerospinUser.tsx` into that layout. Put `key={user.id}` directly on the initializer. Retain its definition, shared worker factory, application layer, credential schema/program, claims, error renderer, and account lifetime.
3. Its ready callback renders UserUI, existing UserSessionFailures, and route children only after `isLoaded`. Keep the failure component beneath UserUI because its hook needs that context. Its external failure-subscription effect remains; no new readiness effect or store is needed.
4. Remove separate `[username]/UserLayout.tsx` and its dashboard/production/dev wrappers. Once draft initialization and drawer baseline reads are removed, delete `components/ZerospinUser.tsx`, including its now-unused initialized-state hook and forwarding components. Current source has no other callers.

## Site shell and production editor

1. Actual SiteLayout keeps its existing height/overflow shell. It does not seed drafts, query a Page, or gate the dev page behind production readiness.
2. Rebuild actual PageLayout from the editor composition currently in EditorLayout. The production route renders it directly:

   ```tsx
   // Existing route module; retain insertion search and add breakpoint search.
   function RouteComponent() {
     const { pageId } = Route.useParams();
     return (
       // 1. A different Page gets fresh editor and viewport state.
       <PageLayout key={pageId}>
         {/* 2. Drawer navigation retains this PageLayout instance. */}
         <Outlet />
       </PageLayout>
     );
   }
   ```

3. Retain parameter validation in the production boundary. Query Site by siteId and Page by both pageId and siteId using ordinary `findFirst` live queries. Keep all PageLayout hooks unconditional before any missing-row return. Render existing NotFound when either row is missing. Missing/mismatched routes must not create terminal session query failures; genuine query/session errors retain their existing owner. These reads replace route checks buried in the deleted draft initializer.
4. Render the editing title from saved Site/Page rows. Preserve necessary height/flex/overflow structure. Remove draft readiness comparisons, seeding renders, the sentinel Page query, and temporary draft gate.
5. Keep MainColumns, toolbar, drawer, WallPreviewViewport, PagePreview breakpoint transitions, and shared WallTree drag/rendering behavior. Replace both wall providers with the concrete ownership below; do not port or change the dev wall implementation.
6. Use actual pageId as PageLayout's key. Remove composite `documentKey` and both provider mount boundaries. Account lifetime is already owned by the keyed initializer. Neither drawer navigation nor breakpoint search changes key the entire editor or settings forms. Retain DrawerHeader's existing pathname key for its publishing-dialog lifetime; it no longer seeds settings.
7. Keep saved Site cardStyle plus the existing local Cards preview override. App's plain authenticated uploadImage and SWRConfig move into PageLayout with their fresh-token lookup, HTTP/schema behavior and abort signal unchanged. Preserve module ImageForm cancellation and Save guards. Storybook continues supplying its own function.

## Wall behavior without an editor provider

1. UserUI remains the session boundary. PagePreview, Modules and the module-detail route call `UserUI.useSession()`, use ordinary live queries, and stage existing commands directly. Do not add wall methods to UserUI or another shared action context.
2. PagePreview owns the production canvas's Wall/Placement/Brick query, view construction, and existing add-on-drop, move, edit and delete handlers. Scope reads by validated Site/Page identity and the URL breakpoint. Retain WallTree's controlled rendering, drag registrations, command payloads and selected-Brick behavior. Stop passing a `renderWall` function through context.
3. Modules and ModuleRouteBody query their current Wall from the same URL breakpoint. Each existing module action supplies a concrete local onAdd: decode the existing insertion target, verify it belongs to that Wall, allocate a Brick ID, stage addBrick, and navigate to the Brick only on successful staging. A missing, malformed, stale or cross-Wall target refuses the action; never turn it into an append. Keep ModuleRoute's validation/body split so hooks remain unconditional.
4. Canvas drop, catalog click and module-detail click are separate UI event owners using the same existing command contract. Use those direct call sites rather than introducing an action factory, injector, shared callback store or new helper to replace the deleted context. Keep shared WallModuleAction unchanged, including its dev-page use.
5. BrickDetail gets its Placement from the URL breakpoint rather than viewport state or an `sm` fallback. Preserve cancellation and saved-state guards when that Placement changes, including guard-initiated URL replacement. Use the existing Placement identity when resetting placement-specific editing; add no draft identity. Settings forms retain their Site/Page keys across breakpoint changes.

## URL breakpoint, available width, and guard hook

1. Production search owns the current breakpoint: `sm`, `md`, `lg` or `xl`. It remains present across drawer, module and Brick navigation. Zustand stores no selected/active breakpoint. Static definitions stay in `BREAKPOINTS`; derive available choices by filtering their preview widths against measured available width.
2. Add App-owned `useEditorViewportStore` in `apps/app/stores/useEditorViewportStore.ts`, with an inline state shape containing `availableWidth: number | null` and its setter. Null means not measured; zero is a real measurement. Store no available-breakpoint array, document identity, DOM node, session, form fields, or persistence data.
3. Add the requested `useBreakpointGuard` in the production Page directory, called once by PageLayout. It reads production search and the width store. It owns a stable callback ref/ResizeObserver for the actual preview region, writes measured width, and disconnects/clears width on detach. Return the preview ref and recognized URL breakpoint as an inferred inline result. Track whether the current attachment has measured using a local ref; before redirecting, require that attachment and read its latest published width. A non-null global value alone could belong to the previous preview.
4. Pass that ref into existing WallPreviewViewport through a plain `previewRef` prop. Its existing ref still owns scroll bookkeeping; stabilize the composed ref and preserve both cleanups. The current inline ref would otherwise detach/reset/reobserve on every URL/store render. Use ordinary callbacks inside these existing owners, without another ref helper. The shared presentation component imports neither the App's store nor router. Delete the now-unused generic useElementWidthRef hook, whose sole current caller is the removed provider.
5. After a current preview measurement, a missing, invalid or non-fitting URL breakpoint is replaced with the largest fitting one, preserving pathname/drawer, Page/Site identity, scroll, and unrelated existing search. Clear insertion when correcting the breakpoint because that target belongs to a different Wall. Use history replacement; do not push resize entries or restore a hidden previously selected breakpoint when width grows.
6. If no breakpoint fits, show the existing minimum-width message and do not redirect. Keep a recognized URL breakpoint rather than silently querying/editing an `sm` fallback. More width enables more choices; it does not automatically change an already fitting URL breakpoint.
7. Keep the measured viewport DOM mounted while width is unknown or URL correction is pending. Do not return null for the whole PageLayout before its measurement ref can attach. Wall/route content may wait for a recognized URL breakpoint. Once recognized, width changes must not unmount settings forms or discard their local fields. Pause canvas interaction while the URL choice cannot fit; never operate on a different effective Wall behind the URL.
8. The hook may use one focused effect to react to width and URL changes and replace the location after commit. This is route correction from a DOM constraint; do not navigate during render or add effects that mirror URL selection into Zustand. Width measurement uses the callback ref and observer cleanup, without a second synchronization effect.

The hook has one App call site. These are focused excerpts, not a new viewport API:

```tsx
// Inside PageLayout, before any conditional content return:
const { breakpoint, previewRef } = useBreakpointGuard();
// 1. Always attach previewRef to the existing viewport's measurement element.
// 2. A recognized breakpoint is the URL value, never a hidden fitting fallback.

// Inside useBreakpointGuard, after reading URL and current measured width:
useEffect(() => {
  if (!hasCurrentMeasurement.current) return;
  const measuredWidth = useEditorViewportStore.getState().availableWidth;
  if (measuredWidth === null) return;
  const largestFitting = BREAKPOINTS.filter((entry) => entry.previewWidth <= measuredWidth).at(-1);
  if (largestFitting === undefined) return;
  if (current !== undefined && current.previewWidth <= measuredWidth) return;
  void navigate({
    to: ".",
    replace: true, // 3. Arrival/resize correction does not add a history entry.
    resetScroll: false,
    search: (previous) => ({
      ...previous,
      breakpoint: largestFitting.id,
      insertion: undefined, // 4. A different Wall invalidates the old target.
    }),
  });
}, [availableWidth, requestedBreakpoint, current, navigate]);
```

9. Breakpoint toolbar/header buttons navigate by updating search and clearing insertion; they no longer call a store setter for selection. Their enabled choices derive from width, and their pressed choice comes from the URL. MainColumns uses width for insufficient-space messaging; PagePreview, Modules and BrickDetail use the URL for Wall/Placement identity.
10. Audit editor navigation as part of the change. Replace current `search: {}` and insertion-only replacements with search that preserves breakpoint: module links, add/open Brick, delete-selected close, drawer links/Close, breakpoint toolbar Close, site toolbar links, Wordmark home, and settings Cancel. Extend ToolbarButton's existing editor-link shape inline to carry search, without adding a navigation wrapper. Dashboard entry may omit breakpoint and let the guard choose the initial fit. Brick form Save/Cancel keep their existing command/reset behavior.
11. Storybook's existing Wall Editor story keeps its mock initializer and UserUI, gets a canonical breakpoint in its memory-router search, and owns its width locally from the existing width control/measurement. Render existing WallTree with host-local query/command wiring in the existing story components instead of either provider. Update its BrickDetail route and Close navigation to preserve breakpoint. Never let multiple stories write the App's global width or call the production guard. App/Storybook uploadImage ownership stays unchanged.

Examples: an `xl` URL at 720px is replaced with `md`; narrowing to 360px replaces it with `sm`; below 360px shows the existing message without another redirect. Growing back to 1440px keeps `sm` selected until the user changes the URL through a breakpoint control.

## Form-local settings

1. Existing `(drawer)/site-settings/page.tsx` and `(drawer)/page-settings/page.tsx` own their persisted row reads. Site lookup uses siteId; Page lookup uses both pageId and siteId. Missing rows render existing NotFound. Pass needed persisted fields to the existing form with an inline props shape and key it by the returned entity ID. No new loader component, named type, context, or initializer helper.
2. Installed live queries read the current SQLite snapshot synchronously during render after session readiness. `findFirst` does not need another query-loading phase. Mount the form only after finding its row, then initialize local fields once with useState. Do not overwrite open fields from query updates through an effect.
3. SiteSettings owns `name`, `description`, `logoUrl`, `faviconLightUrl`, `faviconDarkUrl`, `cardStyle`, and `stickyNavbar`. PageSettings owns `title` and `description`. Normalize nullable editable text/image values to empty strings in form props. Keep read-only publication information live through persisted props.
4. Put Save and Cancel inside each form. This intentionally moves those settings actions from DrawerHeader. Add no action-registration context, portal, header callbacks, or cross-component dirty state. Header retains ordinary Close/navigation, which unmounts and discards the form.
5. Compare local fields with normalized persisted fields for dirty state. Save stages existing updateSiteSettings/updatePageSettings, using actual entity ID and existing payload, with empty strings converted back to null. Stay open. Refused staging keeps fields intact; successful staging is reflected by existing optimistic live queries. Successful staging is not server acknowledgement.
6. Cancel navigates to the base production page. Other drawer navigation also discards fields by unmounting. Reopening reads the latest saved row; changed entity identity remounts with that entity's fields. A live update never erases local input. No separate draft identity or global copy.

The existing Page settings route and form can use this annotated shape. Imports and unchanged markup are omitted:

```tsx
// In existing page-settings/page.tsx, after its scoped live query:
if (page === undefined) return <NotFound />;
return (
  <PageSettings
    key={page.id} // 1. Actual entity identity, without another draft identifier.
    page={{ id: page.id, title: page.title ?? "", description: page.description ?? "" }}
  />
);

// In existing PageSettings, with an inline props shape:
const { page } = props;
const [fields, setFields] = useState(() => ({
  title: page.title,
  description: page.description,
})); // 2. This mounted form owns unsaved fields; no synchronization effect.

// In its onSubmit, after event.preventDefault():
const result = stageAggregateSessionCommand({
  session,
  contractName: "updatePageSettings",
  payload: {
    id: page.id,
    title: fields.title.length > 0 ? fields.title : null,
    description: fields.description.length > 0 ? fields.description : null,
  },
});
if (result._tag === "Failure") return; // 3. Preserve fields on refusal.
// 4. Stay open; persisted props update through the existing live query.
```

7. Preserve SiteSettings' three existing image uploads, input refs, upload status, QR code, share URL, local previews, and independent unpublishSite command. Upload completion updates that mounted form's local fields. Do not redesign this App-owned upload code or move it into Zerospin. Module ImageForm's host-supplied SWR upload contract stays unchanged.

## Delete shared draft consumers coherently

1. DrawerHeader loses both settings-store imports, synchronous baseline reads, initialized-state hook, baseline state, draft projections, dirty comparisons, settings Save commands, and store-reset Cancel. Keep breadcrumbs, preview controls, Close/navigation, saved-content publication queries, and publish commands. Breakpoint controls use URL search and App width selectors instead of the removed viewport context.
2. Wordmark reads saved Site name. SiteHeader reads saved stickyNavbar. Remove settings-route subscriptions that existed only for global draft previews. Document title also reads saved rows. Unsaved changes preview inside forms; the outer editor updates after Save.
3. Publishing keeps using saved Site/Page/Brick/Wall/Placement data. Keep PublishSiteDialog and snapshot commands. Do not save settings implicitly or pass form fields into publication payloads; settings must be saved before publishing their changes.
4. Delete `[siteId]/SiteLayout.tsx`, `siteStore.ts`, `[pageId]/pageStore.ts`, and `EditorLayout.tsx` once their consumers use the owners above. Also delete WallEditorProvider, WallEditorContext, WallViewportProvider/context, and its now-unused width-ref helper after production and story callers are replaced. Do not move obsolete draft/provider machinery elsewhere. Models and command implementations remain untouched.

## Ordered implementation and documentation

1. Establish actual UserLayout auth/readiness with the existing initializer composition. Update its route binding and remove leaf gates. The only permitted dev-route edit is deleting the obsolete gate import and JSX wrapper; leave its query, commands, effects, drag registrations, and markup otherwise verbatim.
2. Establish actual SiteLayout shell and PageLayout editor. Keep working editor components, upload host and Outlet wired while replacing draft-dependent route/title checks with saved-row reads and Page identity.
3. Extend production breakpoint search, add the App width store and useBreakpointGuard, and connect its measurement ref through WallPreviewViewport. Keep the shell measurable before canonical URL readiness and preserve scroll/observer cleanup. Update both breakpoint controls and all editor links/search updates together.
4. Move current wall query/rendering and canvas handlers into PagePreview; replace drawer context consumers with UserUI, scoped URL-driven queries and direct command handlers. Update BrickDetail's Placement identity and existing cancellation guards for URL breakpoint changes. Adapt the existing wall story to local width and canonical memory-router search, with its mock session retained. Remove both providers, their contexts and unused width helper only after these callers are replaced. Do not touch shared WallTree/WallModuleAction or dev wall logic.
5. Change existing settings route reads and forms together: known persisted row in, local fields, commands on Save, breakpoint-preserving navigation on Cancel. Preserve uploads and publishing controls already owned by SiteSettings.
6. Remove draft coordination from DrawerHeader, Wordmark and SiteHeader. Delete obsolete wrappers, settings stores, EditorLayout, and unused initialized-state hook/file after all consumers are replaced. Remove imports made unused by these changes only.
7. Update App and modules READMEs for route ownership, provider-free wall composition, URL breakpoint/width-store ownership, guard behavior, local settings lifetime, Save/Cancel location, saved-only outer preview/publishing, and PageLayout upload ownership. Repoint current App-host links in the two upload research notes and current provider links in card-style research. Update current composition references in dev-route research while preserving its dated commit-linked findings, unrelated documentation WIP, and archived plans.
8. Reconcile an existing glossary only if an implemented domain meaning changes; none is proposed. No new glossary or ADR is expected for this reversible UI composition.
9. Record actual implementation and the explicit verification waiver, then archive through the implementation workflow. Do not report unperformed checks as passing.

## Planned files

`+` creates; `~` modifies; `-` removes after replacement; `→` renames the existing story. The only new runtime files are the requested guard hook and App-owned width store.

```text
qrk.sh/
├── apps/app/
│   ├── ~ README.md
│   ├── components/
│   │   ├── - ZerospinUser.tsx
│   │   └── → WallEditorProvider.stories.tsx → WallEditor.stories.tsx
│   ├── stores/
│   │   └── + useEditorViewportStore.ts          availableWidth + setter only
│   ├── modules/
│   │   ├── ~ README.md
│   │   └── lib/
│   │       ├── ~ WallPreviewViewport.tsx        host previewRef; same DOM/scroll behavior
│   │       ├── - WallViewportProvider.tsx
│   │       └── - useElementWidthRef.ts          no callers after provider removal
│   ├── app/[username]/
│   │   ├── ~ layout.tsx                         UserLayout: auth + readiness
│   │   ├── - UserLayout.tsx
│   │   ├── (dashboard)/
│   │   │   └── ~ layout.tsx
│   │   └── site/[siteId]/
│   │       ├── ~ layout.tsx                     SiteLayout: shared shell
│   │       ├── - SiteLayout.tsx                 delete draft initializer
│   │       ├── - siteStore.ts
│   │       ├── ~ SiteHeader.tsx
│   │       ├── ~ Wordmark.tsx
│   │       ├── Toolbars/
│   │       │   ├── ~ BreakpointsToolbar.tsx
│   │       │   ├── ~ SiteToolbar.tsx
│   │       │   └── ~ ToolbarButton.tsx
│   │       └── page/[pageId]/
│   │           ├── ~ layout.tsx                 PageLayout: editor directly
│   │           ├── + useBreakpointGuard.ts      measurement + URL correction
│   │           ├── - EditorLayout.tsx
│   │           ├── - pageStore.ts
│   │           ├── - WallEditorProvider.tsx
│   │           ├── - WallEditorContext.ts
│   │           ├── ~ MainColumns.tsx
│   │           ├── ~ PagePreview.tsx
│   │           ├── Modules/
│   │           │   └── ~ Modules.tsx
│   │           ├── BrickDetail/
│   │           │   └── ~ BrickDetail.tsx
│   │           ├── PageSettings/
│   │           │   └── ~ PageSettings.tsx
│   │           ├── SiteSettings/
│   │           │   └── ~ SiteSettings.tsx
│   │           └── (drawer)/
│   │               ├── ~ DrawerHeader.tsx
│   │               ├── (bricks)/modules/[moduleId]/
│   │               │   └── ~ page.tsx
│   │               ├── page-settings/
│   │               │   └── ~ page.tsx
│   │               └── site-settings/
│   │                   └── ~ page.tsx
│   └── routes/
│       ├── ~ $username.tsx
│       ├── ~ $username.site.$siteId.tsx
│       ├── ~ $username.site.$siteId.page.$pageId.tsx
│       └── ~ $username.site.$siteId.dev.page.$pageId.$breakpoint.tsx
│               obsolete auth wrapper only; wall implementation intact
└── wiki/
    ├── plans/
    │   └── ~ 042-plan-route-layout-ownership.md
    └── research/
        ├── ~ host-owned-image-uploads.md
        ├── ~ page-brick-card-styling.md
        ├── ~ studio-publishing-ownership.md
        └── ~ wall-editor-development-route.md
```

## Initial implementation outcome

1. Actual UserLayout owns Clerk loading/redirect and the existing connected initializer's ready UserUI branch. Actual SiteLayout owns the shared shell; actual PageLayout owns the production editor, saved-row route/title reads, and authenticated SWR upload function.
2. Removed the old authentication gate, ZerospinUser forwarding components/initialized-state helper, Site/Page draft initializer and stores, EditorLayout, both wall providers/contexts, and unused width-ref helper.
3. PagePreview owns Page-scoped Wall reads, URL-selected rendering and canvas commands. Module chooser/detail use direct UserUI reads and Add commands. BrickDetail uses URL Placement identity and the router navigation lifecycle to invalidate old form callbacks, including programmatic breakpoint changes.
4. App width lives in the dedicated Zustand store. useBreakpointGuard measures the current preview through a stable callback ref and observer, then uses one focused effect to replace missing/unavailable URL breakpoints. The measured shell stays mounted; settings retain their entity identity during resize. Editor links preserve breakpoint and clear insertion where appropriate.
5. Settings routes read saved rows before mounting keyed forms. Forms own fields and Save/Cancel. Outer wordmark, sticky header, document title and publication data use saved rows. Existing settings uploads/QR/share/unpublish and App/Storybook upload ownership remain.
6. The existing Wall Editor story was renamed and uses its own measurement, canonical memory-router URL, mock session and direct WallTree wiring. It writes no App-global width.
7. Dev route changes are limited to deleting its obsolete authentication import and wrapper. Its Wall query, add/move commands, drag registrations, breakpoint handling and remaining markup were left intact. Shared WallTree/WallModuleAction were not edited.
8. Updated App/modules READMEs and the affected current research references, retaining dated historical evidence and unrelated documentation work. No glossary or ADR was added because no implemented domain meaning changed.
9. Verification was explicitly waived. No tests, builds, type checks, lint/format targets, browser interactions, uploads, failure injection or provider calls were run; no runtime result is claimed.

## Implemented follow-up: saved card style and dev canvas adoption

1. Removed BrickCardStyleContext and PageLayout's local Cards override. App's wall, catalog, module details and Brick details use the saved Site.cardStyle. Site Settings keeps its local field and existing Save command. Shared module previews accept a plain styling boolean; Storybook's module examples supply that prop without a context or App session dependency.
2. Removed WallPreviewViewport. PageLayout directly owns its measured scroll element, drawer spacer, toolbar position and DOM cleanup. Opening the drawer reserves 50dvh of trailing space; closing leaves 56px. The layout preserves/clamps scroll position and keeps a bottom-anchored preview at the bottom when geometry changes. Toolbar motion respects reduced motion. useBreakpointGuard still owns width measurement and URL correction.
3. PagePreview now contains the adopted dev Wall query, row-fit/drop resolution, Stack validation, Effect Event callbacks, DOM drag/drop registrations, and add/move command flow. It renders inside the existing WallBreakpointPane browser chrome and SiteHeader. The existing Modules drawer provides drag sources. Successful drop-add opens the Brick form; existing WallPlacement menus and confirmed deletion remain available.
4. MainColumns mounts the recognized, fitting URL breakpoint's PagePreview. There is one current browser frame rather than the earlier four-pane transition composition. Site/Page settings retain their existing entity keys and unsaved-field ownership.
5. Deleted the dev route and regenerated routeTree.gen.ts with the installed TanStack generator. The canvas was adopted before its route source was removed. Models, command implementations, stored data, and the host-owned upload functions remain unchanged.
6. The Wall Editor story remains a controlled WallTree fixture with a mock session and local measurement. It does not establish runtime evidence for the newly adopted production canvas.
7. Updated the current App/modules documentation and affected research ownership notes. No verification was run; route-tree generation was the required source-generation step for deleting the URL.

The current production branch, with DOM wrappers and router plumbing omitted:

```text
UserLayout
└── ConnectedAggregateInitializer
    └── UserUI
        └── SiteLayout
            └── PageLayout                         drawer/scroll/toolbar geometry
                └── SWRConfig(uploadImage)
                    ├── MainColumns
                    │   └── PagePreview             adopted dev query and drag flow
                    │       └── WallBreakpointPane  existing browser chrome
                    │           ├── SiteHeader
                    │           └── Wall canvas → WallPlacement → module content
                    ├── Toolbars
                    └── Drawer
                        ├── DrawerHeader
                        └── Routed forms/catalog/details
```

## Verification policy and existing seams

1. Honor no-verification instruction: no builds, tests, formatting/check targets, browser navigation, uploads, failure injection, or provider calls. Add no verification machinery. Source inspection informed this plan; runtime behavior has not been exercised.
2. If separately requested later, existing seams are username auth/readiness; production Page/drawer navigation and entity changes; breakpoint arrival/resize/history correction; preserving breakpoint and clearing stale insertion on navigation; unknown/insufficient width without measurement deadlock or form resets; isolated story widths; local settings Save/refusal/Cancel/reopen; saved-only outer previews and publishing; and App/Storybook ImageForm. Build/type checks establish import/type compatibility, not runtime lifetimes.
3. The initial implementation preserved the development wall. The later explicit adoption instruction moved its behavior into production and removed the dev URL, as recorded above. Runtime verification remains waived.

## Remaining work

None. The requested implementation and documentation are complete; verification was explicitly waived.
