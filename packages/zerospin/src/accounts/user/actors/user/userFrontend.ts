import { makeFrontendController } from "@zerospin/core/frontendController/makeFrontendController";
import { ZerospinError } from "@zerospin/error";
import { Effect, Schema } from "effect";

import {
  createGrid,
  createPage,
  createSite,
  createUser,
  updateGrid,
} from "../../../../contracts";
import { Grid } from "../../../../models/Grid";
import { Brick } from "../../../../models/Brick";
import { Page } from "../../../../models/Page";
import { Site } from "../../../../models/Site";
import { User } from "../../../../models/User";

export const userFrontend = makeFrontendController({
  contracts: {
    createGrid,
    createPage,
    createSite,
    createUser,
    updateGrid,
  },
  accountName: "user",
  actorName: "user",
  frontendName: "web",
  version: "1.1.0",
  systemName: "qrk-sh",
  models: {
    grid: Grid,
    brick: Brick,
    page: Page,
    site: Site,
    user: User,
  },
  signature: Schema.Struct({
    sessionToken: Schema.String,
  }),
  guards: {
    createSite: [
      Effect.fn("userFrontend.createSiteGuard")(function* ({ actorId, db, payload }) {
        const user = db.query.user
          .findFirst({
            where: { id: { eq: payload.userId } },
          })
          .sync();

        if (user === undefined || user.actorId !== actorId) {
          return yield* new ZerospinError({
            code: "create-site-user-mismatch",
            message: `User ${payload.userId} does not belong to actor ${actorId}`,
            status: 403,
          });
        }
      }),
    ],
    createPage: [
      Effect.fn("userFrontend.createPageGuard")(function* ({ actorId, db, payload }) {
        const site = db.query.site
          .findFirst({
            where: { id: { eq: payload.siteId } },
          })
          .sync();

        if (site === undefined) {
          return yield* new ZerospinError({
            code: "create-page-site-not-found",
            message: `Site ${payload.siteId} was not found`,
            status: 404,
          });
        }

        const user =
          site.userId === null
            ? undefined
            : db.query.user
                .findFirst({
                  where: { id: { eq: site.userId } },
                })
                .sync();

        if (user === undefined || user.actorId !== actorId) {
          return yield* new ZerospinError({
            code: "create-page-user-mismatch",
            message: `Site ${payload.siteId} does not belong to actor ${actorId}`,
            status: 403,
          });
        }
      }),
    ],
    createGrid: [
      Effect.fn("userFrontend.createGridGuard")(function* ({ actorId, db, payload }) {
        const page = db.query.page
          .findFirst({
            where: { id: { eq: payload.pageId } },
          })
          .sync();

        if (page === undefined) {
          return yield* new ZerospinError({
            code: "create-grid-page-not-found",
            message: `Page ${payload.pageId} was not found`,
            status: 404,
          });
        }

        const site =
          page.siteId === null
            ? undefined
            : db.query.site
                .findFirst({
                  where: { id: { eq: page.siteId } },
                })
                .sync();
        const user =
          site === undefined || site.userId === null
            ? undefined
            : db.query.user
                .findFirst({
                  where: { id: { eq: site.userId } },
                })
                .sync();

        if (site === undefined || user === undefined || user.actorId !== actorId) {
          return yield* new ZerospinError({
            code: "create-grid-user-mismatch",
            message: `Page ${payload.pageId} does not belong to actor ${actorId}`,
            status: 403,
          });
        }

        const canonicalGridId = Grid.prefixId(`${payload.pageId}/main`);
        if (payload.id !== canonicalGridId) {
          return yield* new ZerospinError({
            code: "create-grid-id-not-canonical",
            message: `Grid ${payload.id} must use canonical page Grid id ${canonicalGridId}`,
            status: 400,
          });
        }

        const existingGrid = db.query.grid
          .findFirst({
            where: { pageId: { eq: payload.pageId } },
          })
          .sync();

        if (existingGrid !== undefined) {
          return yield* new ZerospinError({
            code: "create-grid-page-already-has-grid",
            message: `Page ${payload.pageId} already has Grid ${existingGrid.id}`,
            status: 409,
          });
        }

        // 1 — a create snapshot cannot repeat a resource id or stable item key.
        for (let brickIndex = 0; brickIndex < payload.bricks.length; brickIndex += 1) {
          const brick = payload.bricks[brickIndex];
          if (brick === undefined) {
            continue;
          }

          const canonicalBrickId = Brick.prefixId(`${payload.id}/${brick.brickKey}`);
          if (brick.id !== canonicalBrickId) {
            return yield* new ZerospinError({
              code: "create-brick-id-not-canonical",
              message: `Brick ${brick.id} must use canonical Brick id ${canonicalBrickId}`,
              status: 400,
            });
          }

          for (
            let comparedBrickIndex = brickIndex + 1;
            comparedBrickIndex < payload.bricks.length;
            comparedBrickIndex += 1
          ) {
            const comparedBrick = payload.bricks[comparedBrickIndex];
            if (comparedBrick === undefined) {
              continue;
            }
            if (brick.id === comparedBrick.id) {
              return yield* new ZerospinError({
                code: "create-grid-duplicate-brick-id",
                message: `Brick id ${brick.id} appears more than once`,
                status: 400,
              });
            }
            if (brick.brickKey === comparedBrick.brickKey) {
              return yield* new ZerospinError({
                code: "create-grid-duplicate-brick-key",
                message: `Brick key ${brick.brickKey} appears more than once`,
                status: 400,
              });
            }
          }

          const existingBrick = db.query.brick
            .findFirst({
              where: { id: { eq: brick.id } },
            })
            .sync();
          if (existingBrick !== undefined) {
            return yield* new ZerospinError({
              code: "create-brick-already-exists",
              message: `Brick ${brick.id} already exists`,
              status: 409,
            });
          }
        }
      }),
    ],
    updateGrid: [
      Effect.fn("userFrontend.updateGridGuard")(function* ({ actorId, db, payload }) {
        const grid = db.query.grid
          .findFirst({
            where: { id: { eq: payload.id } },
          })
          .sync();

        if (grid === undefined) {
          return yield* new ZerospinError({
            code: "update-grid-not-found",
            message: `Grid ${payload.id} was not found`,
            status: 404,
          });
        }

        const page =
          grid.pageId === null
            ? undefined
            : db.query.page
                .findFirst({
                  where: { id: { eq: grid.pageId } },
                })
                .sync();
        const site =
          page === undefined || page.siteId === null
            ? undefined
            : db.query.site
                .findFirst({
                  where: { id: { eq: page.siteId } },
                })
                .sync();
        const user =
          site === undefined || site.userId === null
            ? undefined
            : db.query.user
                .findFirst({
                  where: { id: { eq: site.userId } },
                })
                .sync();

        if (
          page === undefined ||
          site === undefined ||
          user === undefined ||
          user.actorId !== actorId
        ) {
          return yield* new ZerospinError({
            code: "update-grid-user-mismatch",
            message: `Grid ${payload.id} does not belong to actor ${actorId}`,
            status: 403,
          });
        }

        const canonicalGridId = Grid.prefixId(`${grid.pageId}/main`);
        if (payload.id !== canonicalGridId) {
          return yield* new ZerospinError({
            code: "update-grid-id-not-canonical",
            message: `Grid ${payload.id} must use canonical page Grid id ${canonicalGridId}`,
            status: 400,
          });
        }

        if (grid.revision !== payload.expectedRevision) {
          return yield* new ZerospinError({
            code: "update-grid-stale",
            message: `Grid ${payload.id} advanced from revision ${payload.expectedRevision} to ${grid.revision}`,
            status: 409,
          });
        }

        const gridAttributesChanged =
          grid.name !== payload.name || grid.columnCount !== payload.columnCount;
        if (payload.gridIntent === "update" && !gridAttributesChanged) {
          return yield* new ZerospinError({
            code: "update-grid-intent-without-change",
            message: `Grid ${payload.id} declared update intent without changed attributes`,
            status: 400,
          });
        }
        if (payload.gridIntent === "none" && gridAttributesChanged) {
          return yield* new ZerospinError({
            code: "update-grid-change-without-intent",
            message: `Grid ${payload.id} changed without update intent`,
            status: 400,
          });
        }

        const persistedBricks = db.query.brick
          .findMany({
            where: { gridId: { eq: payload.id } },
          })
          .sync();
        let hasMutationIntent = payload.gridIntent === "update";

        // 1 — desired snapshot ids and brick keys must each be unique.
        for (let brickIndex = 0; brickIndex < payload.bricks.length; brickIndex += 1) {
          const brick = payload.bricks[brickIndex];
          if (brick === undefined) {
            continue;
          }

          const canonicalBrickId = Brick.prefixId(`${payload.id}/${brick.brickKey}`);
          if (brick.id !== canonicalBrickId) {
            return yield* new ZerospinError({
              code: "update-brick-id-not-canonical",
              message: `Brick ${brick.id} must use canonical Brick id ${canonicalBrickId}`,
              status: 400,
            });
          }

          for (
            let comparedBrickIndex = brickIndex + 1;
            comparedBrickIndex < payload.bricks.length;
            comparedBrickIndex += 1
          ) {
            const comparedBrick = payload.bricks[comparedBrickIndex];
            if (comparedBrick === undefined) {
              continue;
            }
            if (brick.id === comparedBrick.id) {
              return yield* new ZerospinError({
                code: "update-grid-duplicate-brick-id",
                message: `Brick id ${brick.id} appears more than once`,
                status: 400,
              });
            }
            if (brick.brickKey === comparedBrick.brickKey) {
              return yield* new ZerospinError({
                code: "update-grid-duplicate-brick-key",
                message: `Brick key ${brick.brickKey} appears more than once`,
                status: 400,
              });
            }
          }

          const persistedBrick = db.query.brick
            .findFirst({
              where: { id: { eq: brick.id } },
            })
            .sync();

          if (brick.intent === "create") {
            hasMutationIntent = true;
            if (persistedBrick !== undefined) {
              return yield* new ZerospinError({
                code: "update-grid-create-brick-already-exists",
                message: `Brick ${brick.id} cannot be created because it already exists`,
                status: 409,
              });
            }
            continue;
          }

          if (
            persistedBrick === undefined ||
            persistedBrick.gridId !== payload.id ||
            persistedBrick.brickKey !== brick.brickKey
          ) {
            return yield* new ZerospinError({
              code: "update-brick-identity-mismatch",
              message: `Brick ${brick.id} does not match Grid ${payload.id} and key ${brick.brickKey}`,
              status: 400,
            });
          }

          const brickChanged =
            persistedBrick.x !== brick.x ||
            persistedBrick.y !== brick.y ||
            persistedBrick.w !== brick.w ||
            persistedBrick.h !== brick.h ||
            persistedBrick.collectionName !== brick.collectionName ||
            persistedBrick.variant !== brick.variant ||
            persistedBrick.size !== brick.size;

          if (brick.intent === "update") {
            hasMutationIntent = true;
            if (!brickChanged) {
              return yield* new ZerospinError({
                code: "update-brick-intent-without-change",
                message: `Brick ${brick.id} declared update intent without changed attributes`,
                status: 400,
              });
            }
          } else if (brickChanged) {
            return yield* new ZerospinError({
              code: "update-brick-change-without-intent",
              message: `Brick ${brick.id} changed without update intent`,
              status: 400,
            });
          }
        }

        // 2 — delete ids must be unique, belong to this Grid, and not remain in the desired snapshot.
        for (
          let deletedBrickIndex = 0;
          deletedBrickIndex < payload.deletedBrickIds.length;
          deletedBrickIndex += 1
        ) {
          const deletedBrickId = payload.deletedBrickIds[deletedBrickIndex];
          if (deletedBrickId === undefined) {
            continue;
          }
          hasMutationIntent = true;

          for (
            let comparedDeletedBrickIndex = deletedBrickIndex + 1;
            comparedDeletedBrickIndex < payload.deletedBrickIds.length;
            comparedDeletedBrickIndex += 1
          ) {
            if (deletedBrickId === payload.deletedBrickIds[comparedDeletedBrickIndex]) {
              return yield* new ZerospinError({
                code: "update-grid-duplicate-delete-id",
                message: `Deleted Brick id ${deletedBrickId} appears more than once`,
                status: 400,
              });
            }
          }

          for (const desiredBrick of payload.bricks) {
            if (desiredBrick.id === deletedBrickId) {
              return yield* new ZerospinError({
                code: "update-brick-kept-and-deleted",
                message: `Brick ${deletedBrickId} cannot be kept and deleted in one snapshot`,
                status: 400,
              });
            }
          }

          const deletedBrick = db.query.brick
            .findFirst({
              where: { id: { eq: deletedBrickId } },
            })
            .sync();
          if (deletedBrick === undefined || deletedBrick.gridId !== payload.id) {
            return yield* new ZerospinError({
              code: "update-grid-delete-brick-identity-mismatch",
              message: `Deleted Brick ${deletedBrickId} does not belong to Grid ${payload.id}`,
              status: 400,
            });
          }
        }

        // 3 — every persisted brick must be represented exactly once as kept or deleted.
        for (const persistedBrick of persistedBricks) {
          let isInDesiredSnapshot = false;
          for (const desiredBrick of payload.bricks) {
            if (desiredBrick.id === persistedBrick.id) {
              isInDesiredSnapshot = true;
            }
          }

          let isDeleted = false;
          for (const deletedBrickId of payload.deletedBrickIds) {
            if (deletedBrickId === persistedBrick.id) {
              isDeleted = true;
            }
          }

          if (!isInDesiredSnapshot && !isDeleted) {
            return yield* new ZerospinError({
              code: "update-grid-incomplete-snapshot",
              message: `Persisted Brick ${persistedBrick.id} is missing from the submitted snapshot`,
              status: 400,
            });
          }
        }

        if (!hasMutationIntent) {
          return yield* new ZerospinError({
            code: "update-grid-no-changes",
            message: `Grid ${payload.id} has no changes to save`,
            status: 400,
          });
        }
      }),
    ],
  },
});
