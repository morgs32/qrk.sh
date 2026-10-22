# Drizzle relational-filter depth

Investigated 2026-10-21. Research only: no dependencies, compiler code, commands, or persisted application data changed.

## Finding

**The newly published `1.0.0-rc.5` does not remove the recursive ownership-filter nesting responsible for this failure.** Its relational-filter compiler still emits one `EXISTS (SELECT …)` per relationship and recursively calls itself for the next relationship. The `INNER JOIN` in that branch handles a relation's optional junction table; it does not flatten a multi-relation ownership path. [Pinned rc.5 compiler][filter-source]

At investigation time, the public npm registry's `rc` tag selected `1.0.0-rc.5`, published October 21 at 17:59:58.381 UTC. [Registry metadata][registry]

The release does remove redundant `LIMIT 1` clauses from relational existence filters and redundant SQLite array `coalesce` calls. Those changes landed in commit `4d12832d691afcfb819583089162d58d21bdad58`, dated August 19, and are included in rc.5. [Exact change][simplification-commit], [release PR][rc5-pr], [current SQLite construction][sqlite-source]

Public GitHub's default branch was `main` at `eab8bedbb65d5429c54e612ddbd88aa23091d398`. The relevant v1 prerelease line was `beta` at `5d71fc408add08bd207f4753f4554578ec9e0640`; PR #5966 merged rc.5 into it on October 21 at 17:24:50 UTC. Inspecting only `main` would miss the relevant prerelease compiler. [Main snapshot][main-source], [rc.5 merge][rc5-pr]

## Comparison with the captured QRK query

An isolated SQL-shape reproduction used the public rc.5 tarball, its SQLite proxy compiler without executing a proxy request, and the captured query's model columns and foreign-key edges. Read-only desktop SQLite 3.53.4, with statement caching disabled, measured the smallest expression-depth limit accepting each statement:

| SQL shape | Required depth |
| --- | ---: |
| Captured rc.4 actor-scoped query | 110 |
| rc.5 ownership selections with original result construction | 110 |
| rc.5 ownership selections and rc.5 result construction | 106 |

All three returned identical raw results for the four Walls in the current database. Removing the four array `coalesce` wrappers saves four levels, but 106 still exceeds the observed Workerd limit of 100. These are local SQL-shape results, **not** an installed Zerospin upgrade, general semantic proof, or Workerd runtime verification. SQLite documents expression depth as a limit applied while recursively walking expression trees. [SQLite limits][sqlite-limits]

Temporary evidence resides under `/tmp/drizzle-depth-upstream-20261021/`, including `rc5-visibility-original-result.sql` and `rc5-combined.sql`. These are investigative artifacts, not repository tests or check gates.

## Existing upstream work

1. **PR #5966 / rc.5:** contains the simplifications above and a different query-plan strategy associated with issue #5245. That strategy targets MySQL, PostgreSQL, CockroachDB, and MSSQL; the SQLite relational build config explicitly omits `strategy`. It does not establish a SQLite ownership-chain fix. [Release PR][rc5-pr], [SQLite config][sqlite-config]
2. **Issue #5245:** closed as fixed in rc.5. Its reported problem is low-performing MySQL/PostgreSQL relational queries, addressed by filtering the root before constructing joined results. Its example still contains a nested existence filter; it is not the SQLite expression-depth report. [Issue and maintainer resolution][performance-issue], [strategy commit][strategy-commit]
3. **Issue #3701:** remains open. It asks to remove an unnecessary SQLite subquery wrapper around a one-relation result in the older API. It is related SQL-nesting work, but not the recursive ownership-filter chain under discussion. [Report][nesting-issue]

Public issue/PR searches for `"Expression tree"`, `"nested exists"`, `"depth" "SQLite"`, `"flatten" "filter"`, and `"exists" "join"` did not identify a matching ownership-chain flattening fix. This is a bounded search result, not proof that no unindexed discussion, private work, or other branch contains one. The inspected relevant prerelease source itself confirms the nesting persists. [Search example][depth-search], [compiler][filter-source]

## Recommended next step

Do not build a second relational-filter compiler in Zerospin. A bounded Drizzle contribution would recognize a positive chain of to-one relationship-existence conditions and generate one correlated `EXISTS` containing joins for that path. Keep the joins inside `EXISTS` so multiple matching paths cannot duplicate outer rows. Preserve foreign-key comparisons, relation-local filters, parameters, aliases, and Boolean scopes. Separate existential conditions, `OR`, `NOT`, and negative existence checks must not be indiscriminately merged. This is a proposed compiler optimization, not an implemented or generally verified transformation. [Current owner of relation compilation][filter-source], [SQLite EXISTS semantics][sqlite-exists]

For example, the ownership path `placement.row.stack.section.wall.page.site.user` can be represented as:

```sql
-- One existence question; matching paths do not duplicate the Placement.
where exists (
  select 1
  from "row" as r
  join "stack" as st on st.id = r.stackId
  join "section" as s on s.id = st.sectionId
  join "wall" as w on w.id = s.wallId
  join "page" as pg on pg.id = w.pageId
  join "site" as site on site.id = pg.siteId
  join "user" as u on u.id = site.userId
  where r.id = p.rowId              -- Correlate to the outer Placement p.
    and u.clerkUserId = ?            -- Preserve the same identity parameter.
)
```

Before adoption, establish the exact semantic boundary of the optimization and verify the failing statement on Workerd. rc.5 is not a drop-in recommendation: its release notes include changed filter behavior and changes to relational compiler return shapes, including `relationsFilterToSQL(...).sql` changing from `SQL | undefined` to `SQLChunk[] | undefined`. Zerospin integration must be reviewed before updating. [Breaking changes][rc5-pr]

## Authorized implementation follow-up

The user subsequently authorized the Drizzle fix, Workerd verification, Zerospin/QRK adoption, and final Plan 038 verification.

1. Implemented the optimization in an isolated Drizzle `beta` checkout at `/private/tmp/drizzle-row-visibility-fix`, local commit `840a01f`. Direct positive to-one chains use joins inside the existing `EXISTS`; Boolean branches, many-relations, junction tables, and explicit presence checks retain their existing scopes. No issue or PR was posted upstream.
2. Drizzle's build and formatting check passed. Its existing `relation.test.ts` and `rqb-builders.test.ts` suites passed all 113 tests. Inline SQLite comparisons also preserved ownership, `NOT`, `OR`, missing-parent, empty-filter, and independent many-condition results. No test files or check runners were added.
3. The generated ownership path contains one `EXISTS` and six joins. With the original result-construction SQL retained, desktop SQLite measured depth 38 rather than 110 and returned identical results.
4. An isolated SQLite Durable Object on Workerd reproduced the original maximum-depth-100 error. The patched SQL succeeded, returned all four Walls with the same decoded nested results and specified child ordering, and returned zero rows for a foreign identity. Root Wall ordering is unspecified by the original query, so cross-engine comparison matched Walls by ID. Live application storage was read only; verification data lived in the isolated in-memory runtime. Summary: `/tmp/drizzle-depth-workerd-evidence.json`.
5. Published the final immutable local fork `@zerospin/drizzle-orm@1.0.0-rc.5-qrk.3` under the separate `qrk-depth` tag. Consumers retain `drizzle-orm` imports through an exact npm alias. The final fork also corrects SQLite proxy callback declarations so ordinary row-mode implementations need no casts or overload boilerplate. Runtime compiler metadata identifies the fork correctly. Its build, formatting, and both existing suites (113 tests) pass. Source is recorded through local Drizzle commit `2366c0f`; no official Drizzle release tag changed.
6. Plan 038 was already archived by intervening work: its retained deletion finalized and its canonically empty-Wall insertion passed. That verification and the current deletion implementation are preserved.

7. The user explicitly approved Zerospin 24.0.3 as an exception to the no-backports policy, preserving QRK data. Built all 18 distributable libraries and published all 19 fixed-group packages locally under `qrk-24`; `latest` remains 25.0.1. Registry/tarball checks confirm every version, exact Drizzle alias, and shipped `findFirstOrThrow`. Isolated release source: `/private/tmp/zerospin-drizzle-2403`, commit `9134b87e73`. The dirty 25.x checkout was not modified.
8. QRK's active sibling task is implementing the separately authorized Plan 039 hard cutover. That task stopped the old sessions and backed up/moved the original storage. This follow-up did not reset storage or restore over its work. Additional read-only canonical backups were captured beforehand under `/tmp/qrk-before-drizzle-2403`.
9. Prepared an isolated QRK source snapshot at `/tmp/qrk-drizzle-2403-verify`, updated its exact Zerospin pins to 24.0.3, and aligned all three existing direct Drizzle dependencies with the fork. Its App build passes. A dependency-only candidate patch is saved as `/tmp/qrk-drizzle-2403-dependencies.patch`; it has not been applied to the active checkout.
10. Activation through the existing dev target on port 8791 against a copied SystemRepo catalogue fails with `aggregate-spec-mismatch`. The changed fields are generated selection SQL for `web` actor selections `brick`, `page`, `pageSnapshot`, `placement`, `site`, and `wall`. Zerospin captures SQL in immutable actor/release specs (`projectActorSpec.ts`) and compares it exactly (`assertAcceptedSpec.ts`), so equivalent compiler output still changes declaration identity. The isolated process exited and released port 8791; the live catalogue was not edited.
11. The user authorized coordination with “Find page preview markup thread”. That task confirmed Plan 039's hard cutover and catalogue acceptance already completed on 24.0.2. It requested that active dependencies, runtime, and storage remain untouched while it finishes the separately authorized provider-generation verification. It will not apply the candidate patch or perform another reset under its completed cutover authorization. Therefore adoption cannot be folded into that earlier cutover; preserving the current data requires a separate catalogue-evolution decision.

## Clean selection-definition cutover

The user superseded data preservation and explicitly invoked yolo. The target is
one clean definition format with no catalogue conversion, fallback decoder, or
24.x continuation. The implementation uses committed current development
25.0.1 (`920d4dc9d7`) in `/private/tmp/zerospin-selection-definition`.

- Actor and agent specs retain `definition.config`, a frozen representation of
  authored filters, literal values, identity references, and RAW SQL expression
  structure with canonical model/column references. Compiled SQL and bindings
  remain execution artifacts only. Existing catalogue comparison stays exact.
- 26.0.0 introduced the format. 26.0.1 corrected canonical physical/query table
  references in QRK's published-snapshot RAW predicate. All 18 libraries built
  and all 19 packages published for both versions. Source commit `c637069d56`.
- QRK adopted 26.0.1 exactly and aligned its three direct Drizzle dependencies
  with the fork. Its App build passes. Only local development state for
  `sys_qrk_sh_1` and QRK-origin Zerospin IndexedDB databases were reset; login
  cookies, unrelated `localforage`, credentials, and unrelated storage remain.
- Actual Workerd startup reached `Ready on http://127.0.0.1:8788/ (system spec
  accepted)`. All three accepted catalogue entries contain authored definitions;
  none of their selections contains generated query SQL. The published-snapshot
  definition contains the canonical `page` table reference.
- Fresh authenticated initialization then exposed the rc.5 codec split:
  Zerospin-created bare dialects omitted timestamp normalization. Reproduced
  against the fresh canonical User row: `createdAt` remained numeric. Explicit
  SQLite storage codecs correct the populated read. Boolean and JSON reads also
  pass. Released 26.0.2 with codecs configured consistently for authored,
  contract, ordinary, native, and browser reads. All 18 libraries build and all
  19 registry packages have version/latest 26.0.2. Source commit `fe76efee7f`
  on `codex/selection-definition`; the isolated producer worktree is clean.
- Inline source checks confirmed compiled SQL can differ with an unchanged
  actor spec. Existing catalogue comparison accepts unchanged definitions and
  refuses a changed identity reference. No test/check files or suites were added.

## Final verification

1. QRK has 22 exact Zerospin package pins at 26.0.2 and all three direct Drizzle
   dependencies match the exact fork. Actual Workerd startup reports system spec
   accepted. Its three accepted catalogue entries are byte-for-byte unchanged
   from 26.0.1: the adapter/compiler update required no second reset.
2. Authenticated dashboard initialization, Site creation, and Page creation pass.
   Verification Site `sit_LnkcBny6xstofK3_96rdV`, Page
   `pag_kEFHhqWTdiL9Lo9uer3Mg`. Seven palette drops produce seven canonical
   `addBrick` Success outcomes, indexes 11–16 and 26 (the medium-width Link
   addition). Each Brick has four Placements (7 Bricks / 28 Placements total).
3. Verified seeded Stack reuse, two fitting Icons in one 360px Row, an Article
   occupying its own Row, refusal to share the Article Row, width overflow
   inserting a Map immediately below the pointed Row, and bottom-zone Section
   creation. The bottom zone measures 320px. Existing preview Bricks have zero
   draggable elements.
4. Saved Row IDs and order survive reload. A new Link dropped at the medium
   breakpoint appears in the small-breakpoint tab without reload (6→7 rendered
   Placements). Canonical placement references cover all four Walls. Historical
   Plan 038 and Plan 039 verification remains in their archived plans.
5. Browser proof: `/tmp/qrk-selection-definition-verified.jpg`. Registry proof:
   `/tmp/selection-definition-registry-final.json`. Catalogue proof:
   `/tmp/qrk-selection-definition-catalogue-before-2602.json`. No test files,
   fixtures, standalone check runners, migrations, or compatibility paths added.

The final QRK App build passes on 26.0.2. All 28 canonical Placement references
are unique, resolve to existing Bricks, and belong to their respective Wall;
each breakpoint contains seven Placements. The final Workerd log contains no
SchemaError, Uncaught, or ERROR entries. QRK remains uncommitted.

## Remaining work

None.

[filter-source]: https://github.com/drizzle-team/drizzle-orm/blob/5d71fc408add08bd207f4753f4554578ec9e0640/drizzle-orm/src/relations.ts#L2291-L2344
[registry]: https://registry.npmjs.org/drizzle-orm
[sqlite-source]: https://github.com/drizzle-team/drizzle-orm/blob/5d71fc408add08bd207f4753f4554578ec9e0640/drizzle-orm/src/sqlite-core/dialect.ts#L879-L928
[sqlite-config]: https://github.com/drizzle-team/drizzle-orm/blob/5d71fc408add08bd207f4753f4554578ec9e0640/drizzle-orm/src/sqlite-core/dialect.ts#L74-L78
[simplification-commit]: https://github.com/drizzle-team/drizzle-orm/commit/4d12832d691afcfb819583089162d58d21bdad58
[rc5-pr]: https://github.com/drizzle-team/drizzle-orm/pull/5966
[main-source]: https://github.com/drizzle-team/drizzle-orm/tree/eab8bedbb65d5429c54e612ddbd88aa23091d398
[performance-issue]: https://github.com/drizzle-team/drizzle-orm/issues/5245
[strategy-commit]: https://github.com/drizzle-team/drizzle-orm/commit/2d8bc8e6ec057b6e12571d8b746b2eda2d848d82
[nesting-issue]: https://github.com/drizzle-team/drizzle-orm/issues/3701
[depth-search]: https://github.com/drizzle-team/drizzle-orm/issues?q=%22depth%22+%22SQLite%22
[sqlite-limits]: https://www.sqlite.org/limits.html#max_expr_depth
[sqlite-exists]: https://www.sqlite.org/lang_expr.html#the_exists_operator
