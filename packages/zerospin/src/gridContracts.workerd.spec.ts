import { it } from "@effect/vitest";
import { AsyncLive } from "@zerospin/core/async/AsyncLive";
import { makeResourceDbConfig } from "@zerospin/core/drizzle/makeDbConfig";
import { makeMigratedInMemorySqljsDb } from "@zerospin/core/drizzle/makeMigratedInMemorySqljsDb";
import { DateTime, Effect } from "effect";
import { describe, expect } from "vitest";

import { createGrid, updateGrid } from "./contracts";
import { Grid } from "./models/Grid";
import { GridItem } from "./models/GridItem";
import { Page } from "./models/Page";
import { Site } from "./models/Site";
import { User } from "./models/User";
import { ownerFrontend } from "./ownerFrontend";

describe("aggregate Grid contracts", () => {
  it.effect(
    "createGrid emits one Grid mutation and one mutation for every submitted GridItem",
    () =>
      Effect.gen(function* () {
        const gridId = "grd_contract_create";
        const pageId = "pag_contract_create";
        const firstGridItemId = "gitm_contract_create_first";
        const secondGridItemId = "gitm_contract_create_second";

        const mutations = yield* createGrid.program({
          payload: {
            id: gridId,
            pageId,
            name: "Home grid",
            columnCount: 8,
            gridItems: [
              {
                id: firstGridItemId,
                itemKey: "orange-flag--0",
                x: 0,
                y: 0,
                w: 4,
                h: 4,
                collectionName: "orange-flag",
                brickName: "4x4",
              },
              {
                id: secondGridItemId,
                itemKey: "text-brick-work--0",
                x: 0,
                y: 4,
                w: 8,
                h: 2,
                collectionName: "text-brick",
                brickName: "8x2",
              },
            ],
          },
        });

        expect(mutations).toHaveLength(3);
        expect(mutations[0]).toEqual({
          model: Grid,
          operationName: "create",
          resourceId: gridId,
          operation: {
            attributes: {
              pageId,
              name: "Home grid",
              columnCount: 8,
              revision: 0,
            },
          },
        });
        expect(mutations[1]).toEqual({
          model: GridItem,
          operationName: "create",
          resourceId: firstGridItemId,
          operation: {
            attributes: {
              gridId,
              itemKey: "orange-flag--0",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              brickName: "4x4",
            },
          },
        });
        expect(mutations[2]).toEqual({
          model: GridItem,
          operationName: "create",
          resourceId: secondGridItemId,
          operation: {
            attributes: {
              gridId,
              itemKey: "text-brick-work--0",
              x: 0,
              y: 4,
              w: 8,
              h: 2,
              collectionName: "text-brick",
              brickName: "8x2",
            },
          },
        });
      }),
  );

  it.effect("createGrid with no GridItems emits only the Grid mutation", () =>
    Effect.gen(function* () {
      const mutations = yield* createGrid.program({
        payload: {
          id: "grd_contract_create_empty",
          pageId: "pag_contract_create_empty",
          name: "Empty grid",
          columnCount: 8,
          gridItems: [],
        },
      });

      expect(mutations).toHaveLength(1);
      expect(mutations[0]?.model).toBe(Grid);
      expect(mutations[0]?.operationName).toBe("create");
      expect(mutations[0]?.resourceId).toBe("grd_contract_create_empty");
    }),
  );

  it.effect(
    "updateGrid emits one mixed create/update/delete set and omits unchanged GridItems",
    () =>
      Effect.gen(function* () {
        const gridId = "grd_contract_update";
        const createdGridItemId = "gitm_contract_update_created";
        const unchangedGridItemId = "gitm_contract_update_unchanged";
        const updatedGridItemId = "gitm_contract_update_changed";
        const deletedGridItemId = "gitm_contract_update_deleted";
        const expectedRevision = 3;

        const mutations = yield* updateGrid.program({
          payload: {
            id: gridId,
            name: "Renamed grid",
            columnCount: 12,
            gridIntent: "update",
            expectedRevision,
            gridItems: [
              {
                intent: "create",
                id: createdGridItemId,
                itemKey: "new-brick",
                x: 0,
                y: 0,
                w: 2,
                h: 2,
                collectionName: "orange-flag",
                brickName: "2x2",
              },
              {
                intent: "none",
                id: unchangedGridItemId,
                itemKey: "unchanged-brick",
                x: 2,
                y: 0,
                w: 2,
                h: 2,
                collectionName: "cream-square",
                brickName: "2x2",
              },
              {
                intent: "update",
                id: updatedGridItemId,
                itemKey: "changed-brick",
                x: 0,
                y: 2,
                w: 8,
                h: 2,
                collectionName: "text-brick",
                brickName: "8x2",
              },
            ],
            deletedGridItemIds: [deletedGridItemId],
          },
        });

        expect(mutations).toHaveLength(4);
        expect(mutations[0]).toEqual({
          model: Grid,
          operationName: "update",
          resourceId: gridId,
          operation: {
            attributes: {
              name: "Renamed grid",
              columnCount: 12,
              revision: 4,
            },
          },
        });
        expect(mutations[1]).toEqual({
          model: GridItem,
          operationName: "create",
          resourceId: createdGridItemId,
          operation: {
            attributes: {
              gridId,
              itemKey: "new-brick",
              x: 0,
              y: 0,
              w: 2,
              h: 2,
              collectionName: "orange-flag",
              brickName: "2x2",
            },
          },
        });
        expect(mutations[2]).toEqual({
          model: GridItem,
          operationName: "update",
          resourceId: updatedGridItemId,
          operation: {
            attributes: {
              x: 0,
              y: 2,
              w: 8,
              h: 2,
              collectionName: "text-brick",
              brickName: "8x2",
            },
          },
        });
        expect(mutations[3]).toEqual({
          model: GridItem,
          operationName: "delete",
          resourceId: deletedGridItemId,
          operation: {},
        });
        expect(mutations.some((mutation) => mutation.resourceId === unchangedGridItemId)).toBe(
          false,
        );
      }),
  );

  it.effect("updateGrid advances the aggregate revision for a GridItem-only update", () =>
    Effect.gen(function* () {
      const gridId = "grd_contract_item_only_update";
      const gridItemId = "gitm_contract_item_only_update";
      const mutations = yield* updateGrid.program({
        payload: {
          id: gridId,
          name: "Unchanged grid",
          columnCount: 8,
          gridIntent: "none",
          expectedRevision: 7,
          gridItems: [
            {
              intent: "update",
              id: gridItemId,
              itemKey: "changed-brick",
              x: 4,
              y: 2,
              w: 4,
              h: 4,
              collectionName: "cream-square",
              brickName: "4x4",
            },
          ],
          deletedGridItemIds: [],
        },
      });

      expect(mutations).toHaveLength(2);
      expect(mutations[0]).toEqual({
        model: Grid,
        operationName: "update",
        resourceId: gridId,
        operation: {
          attributes: {
            name: "Unchanged grid",
            columnCount: 8,
            revision: 8,
          },
        },
      });
      expect(mutations[1]?.model).toBe(GridItem);
      expect(mutations[1]?.operationName).toBe("update");
      expect(mutations[1]?.resourceId).toBe(gridItemId);
    }),
  );

  it.effect("updateGrid emits no mutation for an unchanged Grid and unchanged GridItems", () =>
    Effect.gen(function* () {
      const mutations = yield* updateGrid.program({
        payload: {
          id: "grd_contract_update_none",
          name: "Unchanged grid",
          columnCount: 8,
          gridIntent: "none",
          expectedRevision: 0,
          gridItems: [
            {
              intent: "none",
              id: "gitm_contract_update_none",
              itemKey: "unchanged-brick",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              brickName: "4x4",
            },
          ],
          deletedGridItemIds: [],
        },
      });

      expect(mutations).toEqual([]);
    }),
  );
});

describe("owner frontend Grid guards", () => {
  it.effect("rejects noncanonical identity, false intent, incomplete, and stale snapshots", () =>
    Effect.gen(function* () {
      const actorId = "actr_grid_guard_owner";
      const userId = "usr_grid_guard_owner";
      const siteId = "sit_grid_guard_site";
      const pageId = "pag_grid_guard_page";
      const gridId = Grid.prefixId(`${pageId}/main`);
      const gridItemId = GridItem.prefixId(`${gridId}/orange-flag--0`);
      const now = DateTime.toDateUtc(yield* DateTime.now);
      const dbConfig = makeResourceDbConfig({
        models: ownerFrontend.models,
      });
      const db = yield* makeMigratedInMemorySqljsDb({ dbConfig }).pipe(Effect.provide(AsyncLive));

      // 1 — build the owned User -> Site -> Page graph used by both Grid guards.
      db.insert(User.drizzleSchema)
        .values({
          id: userId,
          modelName: User.modelName,
          version: User.version,
          createdAt: now,
          updatedAt: now,
          actorId,
          clerkUserId: "user_grid_guard_owner",
          username: null,
          displayName: null,
        })
        .run();
      db.insert(Site.drizzleSchema)
        .values({
          id: siteId,
          modelName: Site.modelName,
          version: Site.version,
          createdAt: now,
          updatedAt: now,
          userId,
          slug: "guard-site",
          name: "Guard site",
          description: null,
        })
        .run();
      db.insert(Page.drizzleSchema)
        .values({
          id: pageId,
          modelName: Page.modelName,
          version: Page.version,
          createdAt: now,
          updatedAt: now,
          siteId,
          slug: "home",
          title: "Home",
          description: null,
          pageType: "split-scroll",
        })
        .run();

      const [createGuard] = ownerFrontend.guards.createGrid;
      if (createGuard === undefined) {
        throw new Error("Expected ownerFrontend createGrid guard");
      }

      // 2 — Grid and GridItem ids are deterministic parts of the aggregate boundary.
      const noncanonicalGridError = yield* createGuard({
        actorId,
        db,
        payload: {
          id: "grd_grid_guard_noncanonical",
          pageId,
          name: "Home grid",
          columnCount: 8,
          gridItems: [],
        },
      }).pipe(Effect.flip);

      expect(noncanonicalGridError).toMatchObject({
        code: "create-grid-id-not-canonical",
        status: 400,
      });

      const noncanonicalGridItemError = yield* createGuard({
        actorId,
        db,
        payload: {
          id: gridId,
          pageId,
          name: "Home grid",
          columnCount: 8,
          gridItems: [
            {
              id: "gitm_grid_guard_noncanonical",
              itemKey: "orange-flag--0",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              brickName: "4x4",
            },
          ],
        },
      }).pipe(Effect.flip);

      expect(noncanonicalGridItemError).toMatchObject({
        code: "create-grid-item-id-not-canonical",
        status: 400,
      });

      // 3 — complete the owned Page -> Grid -> GridItem graph for update checks.
      db.insert(Grid.drizzleSchema)
        .values({
          id: gridId,
          modelName: Grid.modelName,
          version: Grid.version,
          createdAt: now,
          updatedAt: now,
          pageId,
          name: "Home grid",
          columnCount: 8,
          revision: 0,
        })
        .run();
      db.insert(GridItem.drizzleSchema)
        .values({
          id: gridItemId,
          modelName: GridItem.modelName,
          version: GridItem.version,
          createdAt: now,
          updatedAt: now,
          gridId,
          itemKey: "orange-flag--0",
          x: 0,
          y: 0,
          w: 4,
          h: 4,
          collectionName: "orange-flag",
          brickName: "4x4",
        })
        .run();

      const [guard] = ownerFrontend.guards.updateGrid;
      if (guard === undefined) {
        throw new Error("Expected ownerFrontend updateGrid guard");
      }

      // 4 — unchanged attributes paired with update intent must fail before mutation generation.
      const error = yield* guard({
        actorId,
        db,
        payload: {
          id: gridId,
          name: "Home grid",
          columnCount: 8,
          gridIntent: "none",
          expectedRevision: 0,
          gridItems: [
            {
              intent: "update",
              id: gridItemId,
              itemKey: "orange-flag--0",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              brickName: "4x4",
            },
          ],
          deletedGridItemIds: [],
        },
      }).pipe(Effect.flip);

      expect(error).toMatchObject({
        code: "update-grid-item-intent-without-change",
        status: 400,
      });

      // 5 — a desired item id must be canonical before resource identity is inspected.
      const noncanonicalUpdateItemError = yield* guard({
        actorId,
        db,
        payload: {
          id: gridId,
          name: "Home grid",
          columnCount: 8,
          gridIntent: "none",
          expectedRevision: 0,
          gridItems: [
            {
              intent: "none",
              id: "gitm_grid_guard_noncanonical_update",
              itemKey: "orange-flag--0",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              brickName: "4x4",
            },
          ],
          deletedGridItemIds: [],
        },
      }).pipe(Effect.flip);

      expect(noncanonicalUpdateItemError).toMatchObject({
        code: "update-grid-item-id-not-canonical",
        status: 400,
      });

      // 6 — a canonical desired item cannot claim a missing GridItem resource.
      const foreignIdentityError = yield* guard({
        actorId,
        db,
        payload: {
          id: gridId,
          name: "Home grid",
          columnCount: 8,
          gridIntent: "none",
          expectedRevision: 0,
          gridItems: [
            {
              intent: "none",
              id: GridItem.prefixId(`${gridId}/missing-brick`),
              itemKey: "missing-brick",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              brickName: "4x4",
            },
          ],
          deletedGridItemIds: [],
        },
      }).pipe(Effect.flip);

      expect(foreignIdentityError).toMatchObject({
        code: "update-grid-item-identity-mismatch",
        status: 400,
      });

      // 7 — every persisted GridItem must be kept or explicitly deleted.
      const incompleteSnapshotError = yield* guard({
        actorId,
        db,
        payload: {
          id: gridId,
          name: "Home grid",
          columnCount: 8,
          gridIntent: "none",
          expectedRevision: 0,
          gridItems: [],
          deletedGridItemIds: [],
        },
      }).pipe(Effect.flip);

      expect(incompleteSnapshotError).toMatchObject({
        code: "update-grid-incomplete-snapshot",
        status: 400,
      });

      // 8 — a draft loaded before the current aggregate revision cannot overwrite it.
      const staleSnapshotError = yield* guard({
        actorId,
        db,
        payload: {
          id: gridId,
          name: "Home grid",
          columnCount: 8,
          gridIntent: "none",
          expectedRevision: -1,
          gridItems: [
            {
              intent: "none",
              id: gridItemId,
              itemKey: "orange-flag--0",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              brickName: "4x4",
            },
          ],
          deletedGridItemIds: [],
        },
      }).pipe(Effect.flip);

      expect(staleSnapshotError).toMatchObject({
        code: "update-grid-stale",
        status: 409,
      });
    }),
  );
});
