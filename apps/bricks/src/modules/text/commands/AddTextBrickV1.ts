import {
  defineAggregateContract,
  makeAggregateContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brick } from "../../../zerospin/models/brick/brick";
import { brickV1 } from "../../../zerospin/models/brick/BrickV1";
import { page } from "../../../zerospin/models/page/page";
import { pageV1 } from "../../../zerospin/models/page/PageV1";
import { placementV1 } from "../../../zerospin/models/placement/PlacementV1";
import { siteV1 } from "../../../zerospin/models/site/SiteV1";
import { userV1 } from "../../../zerospin/models/user/UserV1";
import { wallV1 } from "../../../zerospin/models/wall/WallV1";
import { userClaims } from "../../../zerospin/userClaims";
import { insertBrickInWall, wallInsertionFailure } from "../../../zerospin/wall/insertBrickInWall";
import { wallInsertionTargetSchema } from "../../../zerospin/wall/wallInsertionTargetSchema";
import { textV1 } from "../definition/textV1";
import { textDefaultPlacementState } from "./textPlacementState";

export const addTextBrickV1 = makeAggregateContractRelease(
  defineAggregateContract("addTextBrick"),
  {
    version: 1,
    claims: userClaims,
    payload: {
      brickId: modelId({ model: brick }),
      pageId: modelId({ model: page }),
      target: primitives.json({ schema: wallInsertionTargetSchema }),
    },
    models: {
      brick: {
        model: brickV1,
        fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth"],
      },
      page: {
        model: pageV1,
        fields: [
          "createdAt",
          "updatedAt",
          "siteId",
          "slug",
          "title",
          "description",
          "isPublished",
          "publishedSnapshotId",
        ],
      },
      placement: {
        model: placementV1,
        fields: ["createdAt", "updatedAt", "state", "brickId", "wallId", "layoutId", "widthWeight"],
      },
      site: {
        model: siteV1,
        fields: [
          "hostname",
          "name",
          "createdAt",
          "updatedAt",
          "slug",
          "description",
          "isPublished",
          "userId",
          "logoUrl",
          "faviconLightUrl",
          "faviconDarkUrl",
          "stickyNavbar",
          "cardStyle",
          "brickGap",
        ],
      },
      user: { model: userV1, fields: ["createdAt", "updatedAt", "clerkUserId", "displayName"] },
      wall: { model: wallV1, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] },
    },
    operations: {
      createBrick: brickV1.operations.create,
      createPlacement: placementV1.operations.create,
      updateWall: wallV1.operations.update,
    },
    failures: { invalidLayout: wallInsertionFailure },
    program: Effect.fn("addTextBrick.program")(function* (props) {
      const { payload, operations, db, claims } = props;
      yield* operations.createBrick({
        resourceId: payload.brickId,
        attributes: {
          pageId: payload.pageId,
          moduleId: "text",
          state: { content: "" },
          borderWidth: 0,
        },
      });
      yield* insertBrickInWall({
        db,
        operations,
        claims,
        brickId: payload.brickId,
        pageId: payload.pageId,
        target: payload.target,
        module: textV1,
        layoutId: "default",
        placementState: textDefaultPlacementState,
      });
    }),
  },
);
