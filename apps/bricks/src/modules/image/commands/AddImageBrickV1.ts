import { defineAggregateContract, makeAggregateContractRelease, modelId, primitives } from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
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
import { completeImageStateSchemaV4, imageStateSchemaV4, imageV4 } from "../definition/imageV4";

const initialImageStateSchema = Schema.Union([
  completeImageStateSchemaV4,
  Schema.toType(imageStateSchemaV4).check(
    Schema.makeFilter((state) =>
      (state.imageUrl.trim() === "" && state.altText.trim() === "" &&
        state.caption.trim() === "" && state.crop === null) ||
      "An unconfigured image must be empty",
    ),
  ),
]);

export const addImageBrickV1 = makeAggregateContractRelease(defineAggregateContract("addImageBrick"), {
  version: 1,
  claims: userClaims,
  payload: {
    brickId: modelId({ model: brick }),
    pageId: modelId({ model: page }),
    target: primitives.json({ schema: wallInsertionTargetSchema }),
    state: primitives.json({ schema: Schema.NullOr(initialImageStateSchema) }),
    layoutId: primitives.enum({ values: ["default", "captioned", "captionless"] }),
  },
  models: { brick: { model: brickV1, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth"] }, page: { model: pageV1, fields: ["createdAt", "updatedAt", "siteId", "slug", "title", "description", "isPublished", "publishedSnapshotId"] }, placement: { model: placementV1, fields: ["createdAt", "updatedAt", "state", "brickId", "wallId", "layoutId", "widthWeight"] }, site: { model: siteV1, fields: ["name", "createdAt", "updatedAt", "slug", "description", "isPublished", "userId", "logoUrl", "faviconLightUrl", "faviconDarkUrl", "stickyNavbar", "cardStyle", "brickGap"] }, user: { model: userV1, fields: ["createdAt", "updatedAt", "clerkUserId", "username", "displayName"] }, wall: { model: wallV1, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  operations: {
    createBrick: brickV1.operations.create,
    createPlacement: placementV1.operations.create,
    updateWall: wallV1.operations.update,
  },
  failures: { invalidLayout: wallInsertionFailure },
  program: Effect.fn("addImageBrick.program")(function* (props) {
    const { payload, operations, db, claims } = props;
    yield* operations.createBrick({
      resourceId: payload.brickId,
      attributes: { pageId: payload.pageId, moduleId: "image", state: structuredClone(payload.state), borderWidth: 0 },
    });
    yield* insertBrickInWall({
      db, operations, claims,
      brickId: payload.brickId,
      pageId: payload.pageId,
      target: payload.target,
      module: imageV4,
      layoutId: payload.layoutId,
      placementState: {},
    });
  }),
});
