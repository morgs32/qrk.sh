# Which side should store the Page–Wall relationship?

Researched 2026-10-21 from QRK, installed Zerospin 20.1.2, and SQLite's documentation. This compares two designs with one stored relationship direction. No model changes, data changes, or verification runs were performed.

## Recommendation

**For QRK, keep `Wall.pageId` and `Wall.breakpoint`.** Page can still logically own its Walls when the foreign key is stored on Wall. This direction gives every Wall one uniform answer to “which Page do you belong to?”, which the current editing commands need. Page and Wall remain models inside the same User aggregate; moving the foreign key would not move their persistence or command ownership. [Wall model][wall], [wall-based authorization][add-section], [User aggregate][aggregate].

Four Page references are also valid. They express four required, named slots directly. I would prefer them if the main operation were “assign or replace this Page's `smWall`.” QRK instead edits descendants and finds their owning Page. This recommendation follows those operations, not a performance measurement. [Create Page][create-page], [move Stack][move-stack], [add Brick][add-brick].

## What each design actually guarantees

| | Wall references Page: current design | Page references four Walls: alternative |
| --- | --- | --- |
| Stored facts | `Wall.pageId` and `Wall.breakpoint` | `Page.smWallId`, `mdWallId`, `lgWallId`, `xlWallId`; no `Wall.pageId` |
| Required references | Every Wall has a Page ID | Every Page has four filled Wall-ID slots |
| With foreign keys enforced | Each Wall's Page exists | Each slot's referenced Wall exists |
| Uniqueness | Unique `(pageId, breakpoint)` permits at most one Wall per slot | Separate unique constraints prevent reuse in the **same** slot across Pages |
| Missing or shared layouts | Does not require every Page to have all four Walls | Does not alone require four distinct Walls or prevent sharing across different slots |

Reference existence assumes foreign-key enforcement. A foreign key does not require a referenced row to have an inverse child. [Wall model][wall], [SQLite foreign keys][sqlite-fk], [SQLite uniqueness][sqlite-unique].

For example, `Page A.smWallId = W` and `Page B.lgWallId = W` can coexist despite separate unique constraints: they occupy different columns. Cross-slot sharing needs another rule. Pairwise checks could prevent repeated IDs inside one Page, but SQLite `CHECK` constraints cannot query other rows. This follows from the documented constraint scopes. [SQLite uniqueness][sqlite-unique], [SQLite checks][sqlite-check].

The alternative could remove `Wall.breakpoint` and let the Page column identify the role. Retaining it would require ensuring that `smWallId` points to an `sm` Wall.

## The best argument for Page-held references

QRK's four slots are fixed. Required Page references would make their presence explicit and expose `page.smWall` as one object, without unwrapping a filtered array. Zerospin renders forward refs as `one`; `unique: true` makes the inverse optional `one`. [Breakpoint declaration][wall], [installed relation rendering][relations].

Today, `createPage` creates four Walls and `addBrick` checks that four are present. The index only prevents duplicates. Required Page references would therefore give a stronger explicit row shape, not just prettier syntax, while still needing distinctness and exclusive-ownership rules. [Create Page][create-page], [four-Wall check][four-walls].

## Why the current direction fits QRK better

Editing often starts with a Wall or descendant. `addWallSection` follows `wall.pageId` to Page, Site, and User. `moveStack` derives Page from its target Wall. `addBrick` checks that target's Page and uses its breakpoint for placement identity. One parent field supports these paths. [Add Section][add-section], [move Stack][move-stack], [add Brick][add-brick], [placement setup][four-walls].

Four Page refs would need distinct inverse names on Wall, such as `smPage`, `mdPage`, `lgPage`, and `xlPage`; Zerospin rejects duplicate relation names. A generic “find this Wall's Page” would inspect those roles or search four columns. That is possible, but less uniform for these callers. [Relation-name validation][relation-names], [relation rendering][relations].

Page-first reads also work today: publishing lists Walls by `pageId`, and `(pageId, breakpoint)` selects one slot. A singular returned property alone establishes no performance winner. [Publication lookup][publish], [Wall index][wall].

## Creation, replacement, and deletion

Creation currently records Page before its Walls. With required Page refs and immediate foreign-key enforcement, Walls would be inserted first. Both orders work conceptually within one command; neither needs duplicate links. [Current creation][create-page], [SQLite immediate constraints][sqlite-deferred].

Reassigning a current Wall changes its row; replacing an alternative Page slot changes Page. Future replacement/deletion must respect the references and clean up unreferenced rows. These are lifecycle considerations, not claims of an existing Page-deletion command. Installed `modelRef` exposes no cascade/deferred options, and its SQL compiler emits neither option. [Ref options][ref-options], [SQL compilation][sql-fk].

For Site, retain `Page.siteId`: one Site per Page, many Pages per Site, with no stored Page-ID collection on Site. [Page model][page], [relation rendering][relations].

Four parent-held slots trade stronger Page shape and named reads for more complicated reverse ownership and exclusivity rules. The preference for child-held references comes from QRK's operations, not a universal foreign-key rule.

[wall]: ../../apps/zerospin/src/aggregates/user/models/wall/WallV1.ts#L5-L11
[page]: ../../apps/zerospin/src/aggregates/user/models/page/PageV3.ts#L6-L14
[aggregate]: ../../apps/zerospin/src/aggregates/user/UserV3.ts#L60-L73
[create-page]: ../../apps/zerospin/src/aggregates/user/contracts/createPage/CreatePageV3.ts#L87-L115
[add-section]: ../../apps/zerospin/src/aggregates/user/contracts/wall/AddWallSectionContractV1.ts#L40-L59
[move-stack]: ../../apps/zerospin/src/aggregates/user/contracts/wall/MoveStackContractV1.ts#L58-L88
[add-brick]: ../../apps/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV1.ts#L73-L91
[four-walls]: ../../apps/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV1.ts#L267-L285
[publish]: ../../apps/zerospin/src/aggregates/user/contracts/publishPage/PublishPageV2.ts#L98-L114
[ref-options]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/core/dist/models/modelRef.d.ts:3
[relations]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/core/dist/drizzle/definition/renderDrizzleRelations.js:12
[relation-names]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/core/dist/drizzle/definition/bindDatabaseDefinition.js:58
[sql-fk]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/core/dist/drizzle/definition/compileSqliteTableDefinition.js:47
[sqlite-fk]: https://sqlite.org/foreignkeys.html#fk_basics
[sqlite-unique]: https://sqlite.org/lang_createtable.html#unique_constraints
[sqlite-check]: https://sqlite.org/lang_createtable.html#check_constraints
[sqlite-deferred]: https://sqlite.org/foreignkeys.html#fk_deferred
