import { makeActorController } from "@zerospin/core/actorController/makeActorController";
import { makeSurfaceController } from "@zerospin/core/actorController/makeSurfaceController";
import { makeSelection } from "@zerospin/core/models/makeSelection";
import { makeAccountId } from "@zerospin/core/utils/makeAccountId";
import { ZerospinError } from "@zerospin/error";
import { Effect } from "effect";

import {
  createGrid,
  createGridItem,
  createPage,
  createSite,
  createUser,
  updateGridItem,
} from "./contracts";
import { Grid } from "./models/Grid";
import { GridItem } from "./models/GridItem";
import { Page } from "./models/Page";
import { Site } from "./models/Site";
import { User } from "./models/User";
import { ownerFrontend } from "./ownerFrontend";

export const owner = makeActorController({
  models: {
    grid: Grid,
    gridItem: GridItem,
    page: Page,
    site: Site,
    user: User,
  },
  selections: {
    grid: makeSelection({
      model: Grid,
      where: ({ actorId }) => ({
        archivedAt: null,
        page: {
          archivedAt: null,
          site: {
            archivedAt: null,
            user: { actorId, archivedAt: null },
          },
        },
      }),
    }),
    gridItem: makeSelection({
      model: GridItem,
      where: ({ actorId }) => ({
        archivedAt: null,
        grid: {
          archivedAt: null,
          page: {
            archivedAt: null,
            site: {
              archivedAt: null,
              user: { actorId, archivedAt: null },
            },
          },
        },
      }),
    }),
    page: makeSelection({
      model: Page,
      where: ({ actorId }) => ({
        archivedAt: null,
        site: {
          archivedAt: null,
          user: { actorId, archivedAt: null },
        },
      }),
    }),
    site: makeSelection({
      model: Site,
      where: ({ actorId }) => ({
        archivedAt: null,
        user: { actorId, archivedAt: null },
      }),
    }),
    user: makeSelection({
      model: User,
      where: ({ actorId }) => ({ actorId, archivedAt: null }),
    }),
  },
  surfaces: {
    web: makeSurfaceController({
      frontendController: ownerFrontend,
      models: {
        grid: Grid,
        gridItem: GridItem,
        page: Page,
        site: Site,
        user: User,
      },
      contracts: {
        createGrid,
        createGridItem,
        createPage,
        createSite,
        createUser,
        updateGridItem,
      },
      modelAdapters: {},
      contractAdapters: {
        createGrid: ({ payload }) => Effect.succeed(payload),
        createGridItem: ({ payload }) => Effect.succeed(payload),
        createPage: ({ payload }) => Effect.succeed(payload),
        createSite: ({ payload }) => Effect.succeed(payload),
        createUser: ({ payload }) => Effect.succeed(payload),
        updateGridItem: ({ payload }) => Effect.succeed(payload),
      },
      authenticate: (props) =>
        Effect.gen(function* () {
          const user = props.db.query.user
            .findFirst({
              where: { id: { eq: props.signature.userId } },
            })
            .sync();
          if (user === undefined) {
            return yield* new ZerospinError({
              code: "user-not-found",
              message: `User ${props.signature.userId} was not found`,
              status: 404,
            });
          }
          return {
            actorId: user.actorId,
            accountId: makeAccountId({ id: "1" }),
          };
        }),
    }),
  },
});
