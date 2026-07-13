import { makeFrontendController } from "@zerospin/core/frontendController/makeFrontendController";
import { ZerospinError } from "@zerospin/error";
import { Effect, Schema } from "effect";

import { createGrid, createPage, createSite, updateGrid } from "./contracts";
import { Grid } from "./models/Grid";
import { GridItem } from "./models/GridItem";
import { Page } from "./models/Page";
import { Site } from "./models/Site";
import { User } from "./models/User";

export const ownerFrontend = makeFrontendController({
  contracts: {
    createGrid,
    createPage,
    createSite,
    updateGrid,
  },
  accountName: "user",
  actorName: "owner",
  frontendName: "web",
  version: "1.0.0",
  systemName: "qrk-sh",
  models: {
    grid: Grid,
    gridItem: GridItem,
    page: Page,
    site: Site,
    user: User,
  },
  signature: Schema.Struct({
    sessionToken: Schema.String,
  }),
  guards: {
    createSite: [
      Effect.fn("ownerFrontend.createSiteGuard")(function* ({ actorId, db, payload }) {
        const user = db.query.user
          .findFirst({
            where: { id: { eq: payload.userId } },
          })
          .sync();

        if (user === undefined || user.actorId !== actorId) {
          return yield* new ZerospinError({
            code: "create-site-owner-mismatch",
            message: `User ${payload.userId} does not belong to actor ${actorId}`,
            status: 403,
          });
        }
      }),
    ],
    createPage: [
      Effect.fn("ownerFrontend.createPageGuard")(function* ({ actorId, db, payload }) {
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

        const user = db.query.user
          .findFirst({
            where: { id: { eq: site.userId } },
          })
          .sync();

        if (user === undefined || user.actorId !== actorId) {
          return yield* new ZerospinError({
            code: "create-page-owner-mismatch",
            message: `Site ${payload.siteId} does not belong to actor ${actorId}`,
            status: 403,
          });
        }
      }),
    ],
    createGrid: [
      Effect.fn("ownerFrontend.createGridGuard")(function* ({ actorId, db, payload }) {
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

        const site = db.query.site
          .findFirst({
            where: { id: { eq: page.siteId } },
          })
          .sync();
        const user =
          site === undefined
            ? undefined
            : db.query.user
                .findFirst({
                  where: { id: { eq: site.userId } },
                })
                .sync();

        if (site === undefined || user === undefined || user.actorId !== actorId) {
          return yield* new ZerospinError({
            code: "create-grid-owner-mismatch",
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
        for (let gridItemIndex = 0; gridItemIndex < payload.gridItems.length; gridItemIndex += 1) {
          const gridItem = payload.gridItems[gridItemIndex];
          if (gridItem === undefined) {
            continue;
          }

          const canonicalGridItemId = GridItem.prefixId(`${payload.id}/${gridItem.itemKey}`);
          if (gridItem.id !== canonicalGridItemId) {
            return yield* new ZerospinError({
              code: "create-grid-item-id-not-canonical",
              message: `GridItem ${gridItem.id} must use canonical Grid item id ${canonicalGridItemId}`,
              status: 400,
            });
          }

          for (
            let comparedGridItemIndex = gridItemIndex + 1;
            comparedGridItemIndex < payload.gridItems.length;
            comparedGridItemIndex += 1
          ) {
            const comparedGridItem = payload.gridItems[comparedGridItemIndex];
            if (comparedGridItem === undefined) {
              continue;
            }
            if (gridItem.id === comparedGridItem.id) {
              return yield* new ZerospinError({
                code: "create-grid-duplicate-grid-item-id",
                message: `GridItem id ${gridItem.id} appears more than once`,
                status: 400,
              });
            }
            if (gridItem.itemKey === comparedGridItem.itemKey) {
              return yield* new ZerospinError({
                code: "create-grid-duplicate-grid-item-key",
                message: `GridItem key ${gridItem.itemKey} appears more than once`,
                status: 400,
              });
            }
          }

          const existingGridItem = db.query.gridItem
            .findFirst({
              where: { id: { eq: gridItem.id } },
            })
            .sync();
          if (existingGridItem !== undefined) {
            return yield* new ZerospinError({
              code: "create-grid-item-already-exists",
              message: `GridItem ${gridItem.id} already exists`,
              status: 409,
            });
          }
        }
      }),
    ],
    updateGrid: [
      Effect.fn("ownerFrontend.updateGridGuard")(function* ({ actorId, db, payload }) {
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

        const page = db.query.page
          .findFirst({
            where: { id: { eq: grid.pageId } },
          })
          .sync();
        const site =
          page === undefined
            ? undefined
            : db.query.site
                .findFirst({
                  where: { id: { eq: page.siteId } },
                })
                .sync();
        const user =
          site === undefined
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
            code: "update-grid-owner-mismatch",
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

        const persistedGridItems = db.query.gridItem
          .findMany({
            where: { gridId: { eq: payload.id } },
          })
          .sync();
        let hasMutationIntent = payload.gridIntent === "update";

        // 1 — desired snapshot ids and item keys must each be unique.
        for (let gridItemIndex = 0; gridItemIndex < payload.gridItems.length; gridItemIndex += 1) {
          const gridItem = payload.gridItems[gridItemIndex];
          if (gridItem === undefined) {
            continue;
          }

          const canonicalGridItemId = GridItem.prefixId(`${payload.id}/${gridItem.itemKey}`);
          if (gridItem.id !== canonicalGridItemId) {
            return yield* new ZerospinError({
              code: "update-grid-item-id-not-canonical",
              message: `GridItem ${gridItem.id} must use canonical Grid item id ${canonicalGridItemId}`,
              status: 400,
            });
          }

          for (
            let comparedGridItemIndex = gridItemIndex + 1;
            comparedGridItemIndex < payload.gridItems.length;
            comparedGridItemIndex += 1
          ) {
            const comparedGridItem = payload.gridItems[comparedGridItemIndex];
            if (comparedGridItem === undefined) {
              continue;
            }
            if (gridItem.id === comparedGridItem.id) {
              return yield* new ZerospinError({
                code: "update-grid-duplicate-grid-item-id",
                message: `GridItem id ${gridItem.id} appears more than once`,
                status: 400,
              });
            }
            if (gridItem.itemKey === comparedGridItem.itemKey) {
              return yield* new ZerospinError({
                code: "update-grid-duplicate-grid-item-key",
                message: `GridItem key ${gridItem.itemKey} appears more than once`,
                status: 400,
              });
            }
          }

          const persistedGridItem = db.query.gridItem
            .findFirst({
              where: { id: { eq: gridItem.id } },
            })
            .sync();

          if (gridItem.intent === "create") {
            hasMutationIntent = true;
            if (persistedGridItem !== undefined) {
              return yield* new ZerospinError({
                code: "update-grid-create-item-already-exists",
                message: `GridItem ${gridItem.id} cannot be created because it already exists`,
                status: 409,
              });
            }
            continue;
          }

          if (
            persistedGridItem === undefined ||
            persistedGridItem.gridId !== payload.id ||
            persistedGridItem.itemKey !== gridItem.itemKey
          ) {
            return yield* new ZerospinError({
              code: "update-grid-item-identity-mismatch",
              message: `GridItem ${gridItem.id} does not match Grid ${payload.id} and key ${gridItem.itemKey}`,
              status: 400,
            });
          }

          const gridItemChanged =
            persistedGridItem.x !== gridItem.x ||
            persistedGridItem.y !== gridItem.y ||
            persistedGridItem.w !== gridItem.w ||
            persistedGridItem.h !== gridItem.h ||
            persistedGridItem.collectionName !== gridItem.collectionName ||
            persistedGridItem.brickName !== gridItem.brickName;

          if (gridItem.intent === "update") {
            hasMutationIntent = true;
            if (!gridItemChanged) {
              return yield* new ZerospinError({
                code: "update-grid-item-intent-without-change",
                message: `GridItem ${gridItem.id} declared update intent without changed attributes`,
                status: 400,
              });
            }
          } else if (gridItemChanged) {
            return yield* new ZerospinError({
              code: "update-grid-item-change-without-intent",
              message: `GridItem ${gridItem.id} changed without update intent`,
              status: 400,
            });
          }
        }

        // 2 — delete ids must be unique, belong to this Grid, and not remain in the desired snapshot.
        for (
          let deletedGridItemIndex = 0;
          deletedGridItemIndex < payload.deletedGridItemIds.length;
          deletedGridItemIndex += 1
        ) {
          const deletedGridItemId = payload.deletedGridItemIds[deletedGridItemIndex];
          if (deletedGridItemId === undefined) {
            continue;
          }
          hasMutationIntent = true;

          for (
            let comparedDeletedGridItemIndex = deletedGridItemIndex + 1;
            comparedDeletedGridItemIndex < payload.deletedGridItemIds.length;
            comparedDeletedGridItemIndex += 1
          ) {
            if (deletedGridItemId === payload.deletedGridItemIds[comparedDeletedGridItemIndex]) {
              return yield* new ZerospinError({
                code: "update-grid-duplicate-delete-id",
                message: `Deleted GridItem id ${deletedGridItemId} appears more than once`,
                status: 400,
              });
            }
          }

          for (const desiredGridItem of payload.gridItems) {
            if (desiredGridItem.id === deletedGridItemId) {
              return yield* new ZerospinError({
                code: "update-grid-item-kept-and-deleted",
                message: `GridItem ${deletedGridItemId} cannot be kept and deleted in one snapshot`,
                status: 400,
              });
            }
          }

          const deletedGridItem = db.query.gridItem
            .findFirst({
              where: { id: { eq: deletedGridItemId } },
            })
            .sync();
          if (deletedGridItem === undefined || deletedGridItem.gridId !== payload.id) {
            return yield* new ZerospinError({
              code: "update-grid-delete-item-identity-mismatch",
              message: `Deleted GridItem ${deletedGridItemId} does not belong to Grid ${payload.id}`,
              status: 400,
            });
          }
        }

        // 3 — every persisted item must be represented exactly once as kept or deleted.
        for (const persistedGridItem of persistedGridItems) {
          let isInDesiredSnapshot = false;
          for (const desiredGridItem of payload.gridItems) {
            if (desiredGridItem.id === persistedGridItem.id) {
              isInDesiredSnapshot = true;
            }
          }

          let isDeleted = false;
          for (const deletedGridItemId of payload.deletedGridItemIds) {
            if (deletedGridItemId === persistedGridItem.id) {
              isDeleted = true;
            }
          }

          if (!isInDesiredSnapshot && !isDeleted) {
            return yield* new ZerospinError({
              code: "update-grid-incomplete-snapshot",
              message: `Persisted GridItem ${persistedGridItem.id} is missing from the submitted snapshot`,
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
