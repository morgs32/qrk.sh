import { it } from "@effect/vitest";
import { AsyncLive } from "@zerospin/core/async/AsyncLive";
import { makeResourceDbConfig } from "@zerospin/core/drizzle/makeDbConfig";
import { makeMigratedInMemorySqljsDb } from "@zerospin/core/drizzle/makeMigratedInMemorySqljsDb";
import { DateTime, Effect } from "effect";
import { describe, expect } from "vitest";

import { createGrid, updateGrid } from "./contracts";
import { Grid } from "./models/Grid";
import { Brick } from "./models/Brick";
import { Page } from "./models/Page";
import { Site } from "./models/Site";
import { User } from "./models/User";
import { userFrontend } from "./accounts/user/actors/user/userFrontend";

describe("aggregate Grid contracts", () => {
  it.effect("createGrid emits one Grid mutation and one mutation for every submitted Brick", () =>
    Effect.gen(function* () {
      const gridId = "grd_contract_create";
      const pageId = "pag_contract_create";
      const firstBrickId = "brck_contract_create_first";
      const secondBrickId = "brck_contract_create_second";

      const mutations = yield* createGrid.program({
        payload: {
          id: gridId,
          pageId,
          name: "Home grid",
          columnCount: 8,
          bricks: [
            {
              id: firstBrickId,
              brickKey: "orange-flag--0",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              variant: "default",
              size: "4x4",
            },
            {
              id: secondBrickId,
              brickKey: "text-brick-work--0",
              x: 0,
              y: 4,
              w: 8,
              h: 2,
              collectionName: "text-brick",
              variant: "default",
              size: "8x2",
            },
          ],
        },
      });

      expect(mutations).toHaveLength(3);
      expect(mutations[0]).toEqual({
        model: Grid,
        modelVersion: "1.0.0",
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
        model: Brick,
        modelVersion: "1.0.0",
        operationName: "create",
        resourceId: firstBrickId,
        operation: {
          attributes: {
            gridId,
            brickKey: "orange-flag--0",
            x: 0,
            y: 0,
            w: 4,
            h: 4,
            collectionName: "orange-flag",
            variant: "default",
            size: "4x4",
          },
        },
      });
      expect(mutations[2]).toEqual({
        model: Brick,
        modelVersion: "1.0.0",
        operationName: "create",
        resourceId: secondBrickId,
        operation: {
          attributes: {
            gridId,
            brickKey: "text-brick-work--0",
            x: 0,
            y: 4,
            w: 8,
            h: 2,
            collectionName: "text-brick",
            variant: "default",
            size: "8x2",
          },
        },
      });
    }),
  );

  it.effect("createGrid with no Bricks emits only the Grid mutation", () =>
    Effect.gen(function* () {
      const mutations = yield* createGrid.program({
        payload: {
          id: "grd_contract_create_empty",
          pageId: "pag_contract_create_empty",
          name: "Empty grid",
          columnCount: 8,
          bricks: [],
        },
      });

      expect(mutations).toHaveLength(1);
      expect(mutations[0]?.model).toBe(Grid);
      expect(mutations[0]?.operationName).toBe("create");
      expect(mutations[0]?.resourceId).toBe("grd_contract_create_empty");
    }),
  );

  it.effect("updateGrid emits one mixed create/update/delete set and omits unchanged Bricks", () =>
    Effect.gen(function* () {
      const gridId = "grd_contract_update";
      const createdBrickId = "brck_contract_update_created";
      const unchangedBrickId = "brck_contract_update_unchanged";
      const updatedBrickId = "brck_contract_update_changed";
      const deletedBrickId = "brck_contract_update_deleted";
      const expectedRevision = 3;

      const mutations = yield* updateGrid.program({
        payload: {
          id: gridId,
          name: "Renamed grid",
          columnCount: 12,
          gridIntent: "update",
          expectedRevision,
          bricks: [
            {
              intent: "create",
              id: createdBrickId,
              brickKey: "new-brick",
              x: 0,
              y: 0,
              w: 2,
              h: 2,
              collectionName: "orange-flag",
              variant: "default",
              size: "2x2",
            },
            {
              intent: "none",
              id: unchangedBrickId,
              brickKey: "unchanged-brick",
              x: 2,
              y: 0,
              w: 2,
              h: 2,
              collectionName: "cream-square",
              variant: "default",
              size: "2x2",
            },
            {
              intent: "update",
              id: updatedBrickId,
              brickKey: "changed-brick",
              x: 0,
              y: 2,
              w: 8,
              h: 2,
              collectionName: "text-brick",
              variant: "default",
              size: "8x2",
            },
          ],
          deletedBrickIds: [deletedBrickId],
        },
      });

      expect(mutations).toHaveLength(4);
      expect(mutations[0]).toEqual({
        model: Grid,
        modelVersion: "1.0.0",
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
        model: Brick,
        modelVersion: "1.0.0",
        operationName: "create",
        resourceId: createdBrickId,
        operation: {
          attributes: {
            gridId,
            brickKey: "new-brick",
            x: 0,
            y: 0,
            w: 2,
            h: 2,
            collectionName: "orange-flag",
            variant: "default",
            size: "2x2",
          },
        },
      });
      expect(mutations[2]).toEqual({
        model: Brick,
        modelVersion: "1.0.0",
        operationName: "update",
        resourceId: updatedBrickId,
        operation: {
          attributes: {
            x: 0,
            y: 2,
            w: 8,
            h: 2,
            collectionName: "text-brick",
            variant: "default",
            size: "8x2",
          },
        },
      });
      expect(mutations[3]).toEqual({
        model: Brick,
        modelVersion: "1.0.0",
        operationName: "delete",
        resourceId: deletedBrickId,
        operation: {},
      });
      expect(mutations.some((mutation) => mutation.resourceId === unchangedBrickId)).toBe(false);
    }),
  );

  it.effect("updateGrid advances the aggregate revision for a Brick-only update", () =>
    Effect.gen(function* () {
      const gridId = "grd_contract_brick_only_update";
      const brickId = "brck_contract_brick_only_update";
      const mutations = yield* updateGrid.program({
        payload: {
          id: gridId,
          name: "Unchanged grid",
          columnCount: 8,
          gridIntent: "none",
          expectedRevision: 7,
          bricks: [
            {
              intent: "update",
              id: brickId,
              brickKey: "changed-brick",
              x: 4,
              y: 2,
              w: 4,
              h: 4,
              collectionName: "cream-square",
              variant: "default",
              size: "4x4",
            },
          ],
          deletedBrickIds: [],
        },
      });

      expect(mutations).toHaveLength(2);
      expect(mutations[0]).toEqual({
        model: Grid,
        modelVersion: "1.0.0",
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
      expect(mutations[1]?.model).toBe(Brick);
      expect(mutations[1]?.operationName).toBe("update");
      expect(mutations[1]?.resourceId).toBe(brickId);
    }),
  );

  it.effect("updateGrid emits no mutation for an unchanged Grid and unchanged Bricks", () =>
    Effect.gen(function* () {
      const mutations = yield* updateGrid.program({
        payload: {
          id: "grd_contract_update_none",
          name: "Unchanged grid",
          columnCount: 8,
          gridIntent: "none",
          expectedRevision: 0,
          bricks: [
            {
              intent: "none",
              id: "brck_contract_update_none",
              brickKey: "unchanged-brick",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              variant: "default",
              size: "4x4",
            },
          ],
          deletedBrickIds: [],
        },
      });

      expect(mutations).toEqual([]);
    }),
  );
});

describe("user frontend Grid guards", () => {
  it.effect("rejects noncanonical identity, false intent, incomplete, and stale snapshots", () =>
    Effect.gen(function* () {
      const actorId = "actr_grid_guard_user";
      const userId = "usr_grid_guard_user";
      const siteId = "sit_grid_guard_site";
      const pageId = "pag_grid_guard_page";
      const gridId = Grid.prefixId(`${pageId}/main`);
      const brickId = Brick.prefixId(`${gridId}/orange-flag--0`);
      const now = DateTime.toDateUtc(yield* DateTime.now);
      const dbConfig = makeResourceDbConfig({
        models: userFrontend.models,
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
          clerkUserId: "user_grid_guard_user",
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

      const [createGuard] = userFrontend.guards.createGrid;
      if (createGuard === undefined) {
        throw new Error("Expected userFrontend createGrid guard");
      }

      // 2 — Grid and Brick ids are deterministic parts of the aggregate boundary.
      const noncanonicalGridError = yield* createGuard({
        actorId,
        db,
        payload: {
          id: "grd_grid_guard_noncanonical",
          pageId,
          name: "Home grid",
          columnCount: 8,
          bricks: [],
        },
      }).pipe(Effect.flip);

      expect(noncanonicalGridError).toMatchObject({
        code: "create-grid-id-not-canonical",
        status: 400,
      });

      const noncanonicalBrickError = yield* createGuard({
        actorId,
        db,
        payload: {
          id: gridId,
          pageId,
          name: "Home grid",
          columnCount: 8,
          bricks: [
            {
              id: "brck_grid_guard_noncanonical",
              brickKey: "orange-flag--0",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              variant: "default",
              size: "4x4",
            },
          ],
        },
      }).pipe(Effect.flip);

      expect(noncanonicalBrickError).toMatchObject({
        code: "create-brick-id-not-canonical",
        status: 400,
      });

      // 3 — complete the owned Page -> Grid -> Brick graph for update checks.
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
      db.insert(Brick.drizzleSchema)
        .values({
          id: brickId,
          modelName: Brick.modelName,
          version: Brick.version,
          createdAt: now,
          updatedAt: now,
          gridId,
          brickKey: "orange-flag--0",
          x: 0,
          y: 0,
          w: 4,
          h: 4,
          collectionName: "orange-flag",
          variant: "default",
          size: "4x4",
        })
        .run();

      const [guard] = userFrontend.guards.updateGrid;
      if (guard === undefined) {
        throw new Error("Expected userFrontend updateGrid guard");
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
          bricks: [
            {
              intent: "update",
              id: brickId,
              brickKey: "orange-flag--0",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              variant: "default",
              size: "4x4",
            },
          ],
          deletedBrickIds: [],
        },
      }).pipe(Effect.flip);

      expect(error).toMatchObject({
        code: "update-brick-intent-without-change",
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
          bricks: [
            {
              intent: "none",
              id: "brck_grid_guard_noncanonical_update",
              brickKey: "orange-flag--0",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              variant: "default",
              size: "4x4",
            },
          ],
          deletedBrickIds: [],
        },
      }).pipe(Effect.flip);

      expect(noncanonicalUpdateItemError).toMatchObject({
        code: "update-brick-id-not-canonical",
        status: 400,
      });

      // 6 — a canonical desired item cannot claim a missing Brick resource.
      const foreignIdentityError = yield* guard({
        actorId,
        db,
        payload: {
          id: gridId,
          name: "Home grid",
          columnCount: 8,
          gridIntent: "none",
          expectedRevision: 0,
          bricks: [
            {
              intent: "none",
              id: Brick.prefixId(`${gridId}/missing-brick`),
              brickKey: "missing-brick",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              variant: "default",
              size: "4x4",
            },
          ],
          deletedBrickIds: [],
        },
      }).pipe(Effect.flip);

      expect(foreignIdentityError).toMatchObject({
        code: "update-brick-identity-mismatch",
        status: 400,
      });

      // 7 — every persisted Brick must be kept or explicitly deleted.
      const incompleteSnapshotError = yield* guard({
        actorId,
        db,
        payload: {
          id: gridId,
          name: "Home grid",
          columnCount: 8,
          gridIntent: "none",
          expectedRevision: 0,
          bricks: [],
          deletedBrickIds: [],
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
          bricks: [
            {
              intent: "none",
              id: brickId,
              brickKey: "orange-flag--0",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              collectionName: "orange-flag",
              variant: "default",
              size: "4x4",
            },
          ],
          deletedBrickIds: [],
        },
      }).pipe(Effect.flip);

      expect(staleSnapshotError).toMatchObject({
        code: "update-grid-stale",
        status: 409,
      });
    }),
  );
});
