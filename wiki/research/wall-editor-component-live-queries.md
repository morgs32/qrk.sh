# Should nested wall components own their live queries?

Researched 2026-10-21 from the installed Zerospin implementation, QRK source, and official React documentation. No application changes, benchmarks, or verification runs were performed. The inspected App installation resolves Zerospin `20.1.2`, while App's manifest still declares `20.1.1`; the runtime findings below describe the installed implementation. [Manifest][manifest], [installed React package][installed-package].

## Answer

**Component-owned queries can reduce the work done by a large parent, but they do not currently provide automatic row-level render isolation in Zerospin.** Every live query watching a changed table reruns, even if its `where` clause selects a different row. Each successful rerun publishes a new query-store snapshot, without comparing the old and new result. Replacing one wall query with many per-ID queries can therefore add SQL work and subscriptions while still updating every Brick subscriber. This is a source-derived trade-off; its net performance effect has not been measured. [Query construction and publication][live-query], [table invalidation][query-invalidation], [React query subscription][react-query].

## What actually happens today

At research time, the development route made one local query containing Page, Site, the fixed `sm` Wall, Sections, Stacks, Rows, Placements, and Bricks. The same component sorted and rendered the resulting hierarchy. A changed query snapshot updates that parent, so it repeats those render-time maps and sorts. The route now queries Wall directly by page ID and its breakpoint URL parameter, with `page.site` included; the initial fixed-`sm` observation is retained here. [Development route][development-route].

`UserUI.useSession()` itself just reads the existing session from React context. It does not subscribe each component to every model change. `useLiveQuery` reads the initialized database from that session, and its database-specific hook creates the live-query instance. These reads execute against the local SQLite database; adding child queries does not create one HTTP fetch or server subscription per child. [Session context][session-context], [session/database hook][session-query], [SQLite read execution][sqlite-query].

The implementation has four relevant properties:

1. **Dependencies are tables.** SQLite read capture records the table name. The write hook also records table names, ignoring the row ID. After a committed write batch, live queries rerun when their captured table set intersects the changed set. A query filtered to Brick A still watches the Brick table. [SQLite read capture][sqlite-read-tracking], [write hook][sqlite-tracking], [table invalidation][query-invalidation].
2. **Each hook owns a live query.** `useLiveQueryOnDb` constructs its own query/store and subscription. There is no cross-hook query deduplication in this path; repeated identical child queries still have separate instances. [React query lifecycle][react-query], [query construction][live-query].
3. **Reruns publish unconditionally.** The query runtime writes the newly read `data` and a fresh `updatedAt` into its store. It does not suppress an update because the selected row is unchanged. The hook's deep comparison concerns its `key`, not the query result. [Query publication][query-publication], [key handling][react-query].
4. **React subscribes to the whole query state.** The hook calls Zustand's `useStore(liveQuery.store)` without a selector. Zustand supplies an identity selector by default; publishing a new state object changes that snapshot. Destructuring only `data` from the hook's return value does not install a data-only selector. [React query subscription][react-query], [Zustand bridge][zustand-react], [store publication][zustand-store].

React's external-store contract rerenders the consumer when its snapshot changes according to `Object.is`. Splitting components changes which component owns that subscription, but it does not change the database's invalidation rules. Ordinary children can also rerender when their parent renders. `memo` can skip unchanged props, but it does not suppress updates from a component's own subscription or changing context. [React external stores](https://react.dev/reference/react/useSyncExternalStore), [React memoization](https://react.dev/reference/react/memo).

## Two concrete examples

| Event | One deep wall query | A separate query in each Brick component |
| --- | --- | --- |
| A committed change only to Brick A's row | The wall query watches Brick, rereads the hierarchy, and updates the parent. | Every mounted query watching Brick rereads and publishes, including Brick B's filtered query. A parent query excluding Brick could stay unchanged. |
| A Placement's order or spec changes | The wall query watches Placement and reruns. | A Brick-only query avoids that table, but it cannot supply the saved Placement spec. Queries reading Placement also rerun across that table; a layout parent depending on Placement reruns too. |

These are consequences of table-set invalidation and unconditional publication, rather than measured frame timings. The current route reads saved Placement specs as well as Brick state. [Query invalidation][query-invalidation], [query publication][query-publication], [development renderer][development-renderer].

Actual editing is broader than the first example: `updateBrick` updates Brick state/revision and invokes Placement updates for existing breakpoints. Completing spec generation updates a Placement's spec, revision, and generation state. Separating content from topology does not establish that ordinary saves will leave layout subscribers untouched. [UpdateBrick][update-brick], [spec completion][generate-spec].

## Recommendation for the fresh route

Keep the initial route simple. Extract components when they gain a clear rendering or interaction responsibility; choose query ownership based on the data each responsibility needs. **Do not introduce a query at every Section, Stack, Row, and Placement merely to pursue a presumed performance win.** With the current runtime, that creates more stores/listeners and independent SQL reads while same-table changes still fan out. Each query execution also prepares/executes SQL and constructs result rows. [Hook lifecycle][react-query], [query runtime][live-query], [SQL execution][sqlite-query], [row construction][sqlite-rows].

A possible later split is a layout owner reading hierarchy/IDs and leaf content readers consuming Brick state plus saved Placement content. It could avoid repeating the hierarchy query for strictly Brick-only changes. It also adds queries, and all leaf queries watching Brick would still publish on each Brick-table change. Treat this as an ownership option with a specific limited benefit, not a generally faster design.

If the goal becomes “changing Brick A should leave unchanged Brick B's query consumer alone,” investigate stable data snapshots and equality-aware subscriptions in the existing SDK path before relying on per-Brick subscriptions. Merely comparing newly allocated data objects by identity would be insufficient; suppressing `updatedAt` changes blindly could also break metadata consumers. Row-level invalidation is another possible optimization, with different implementation costs. This note does not design a new selector API or make an SDK change a prerequisite for the current development route. [Row construction][sqlite-rows], [published query state][query-publication].

The relevant costs are separate: **SQL reruns, result construction/comparison, and React rendering**. Moving a query down the component tree can change one cost while increasing another. This research establishes the mechanism, not the size or sign of a performance improvement.

[manifest]: /Users/morgs32/GitHub/qrk.sh/apps/app/package.json:37
[installed-package]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/react/package.json:3
[development-route]: /Users/morgs32/GitHub/qrk.sh/apps/app/routes/$username.site.$siteId.dev.page.$pageId.$breakpoint.tsx
[development-renderer]: /Users/morgs32/GitHub/qrk.sh/apps/app/routes/$username.site.$siteId.dev.page.$pageId.$breakpoint.tsx
[session-context]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/react/dist/createUI.js:6
[session-query]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/react/dist/useLiveQuery.js:12
[react-query]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/react/dist/useLiveQueryOnDb.js:7
[live-query]: /Users/morgs32/GitHub/qrk.sh/node_modules/.pnpm/@zerospin+live-query@20.1.2_@cloudflare+workers-types@5.20260828.1_@opentelemetry+api@1_4cd68a27839020958762c95aa5a7cf7b/node_modules/@zerospin/live-query/dist/makeLiveQuery.js:18
[query-publication]: /Users/morgs32/GitHub/qrk.sh/node_modules/.pnpm/@zerospin+live-query@20.1.2_@cloudflare+workers-types@5.20260828.1_@opentelemetry+api@1_4cd68a27839020958762c95aa5a7cf7b/node_modules/@zerospin/live-query/dist/makeLiveQuery.js:50
[query-invalidation]: /Users/morgs32/GitHub/qrk.sh/node_modules/.pnpm/@zerospin+live-query@20.1.2_@cloudflare+workers-types@5.20260828.1_@opentelemetry+api@1_4cd68a27839020958762c95aa5a7cf7b/node_modules/@zerospin/live-query/dist/makeLiveQuery.js:96
[sqlite-read-tracking]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/core/dist/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.js:50
[sqlite-tracking]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/core/dist/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.js:186
[sqlite-query]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/core/dist/drizzle/SqliteSession.js:20
[sqlite-rows]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/core/dist/drizzle/executeStatementRows.js:18
[zustand-react]: /Users/morgs32/GitHub/qrk.sh/node_modules/.pnpm/zustand@5.0.15_@types+react@19.2.17_react@19.2.7_use-sync-external-store@1.7.0_react@19.2.7_/node_modules/zustand/react.js:6
[zustand-store]: /Users/morgs32/GitHub/qrk.sh/node_modules/.pnpm/zustand@5.0.15_@types+react@19.2.17_react@19.2.7_use-sync-external-store@1.7.0_react@19.2.7_/node_modules/zustand/vanilla.js:6
[update-brick]: /Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/contracts/brick/UpdateBrickV1.ts:147
[generate-spec]: /Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecV1.ts:184
