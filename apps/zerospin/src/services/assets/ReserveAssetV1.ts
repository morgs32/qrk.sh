import { site } from "@qrk.sh/bricks/zerospin/models/site/site";
import {
  ContractError,
  defineServiceContract,
  findFirst,
  makeServiceContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { asset } from "./asset";
import { assetV1 } from "./AssetV1";

export const reserveAssetV1 = makeServiceContractRelease(defineServiceContract("reserveAsset"), {
  version: 1,
  payload: {
    assetId: modelId({ model: asset }),
    ownerAggregateId: primitives.text(),
    uploadSiteId: modelId({ model: site }),
    objectKey: primitives.text(),
    contentType: primitives.text(),
    size: primitives.integer(),
    sha256: primitives.text(),
  },
  models: {
    asset: {
      model: assetV1,
      fields: ["ownerAggregateId", "uploadSiteId", "objectKey", "contentType", "size", "sha256"],
    },
  },
  operations: { create: assetV1.operations.create },
  failures: { conflict: ContractError.schema({ code: "asset-reservation-conflict" }) },
  program: Effect.fn("assets.reserveAsset")(function* (props) {
    const { payload, db, operations, failures } = props;
    const { assetId, ownerAggregateId, uploadSiteId, objectKey, contentType, size, sha256 } = payload;
    const existing = yield* findFirst({
      db,
      model: db.models.asset,
      where: { id: { eq: assetId } },
    });
    if (existing !== undefined) {
      if (
        existing.ownerAggregateId !== ownerAggregateId ||
        existing.uploadSiteId !== uploadSiteId ||
        existing.objectKey !== objectKey ||
        existing.contentType !== contentType ||
        existing.size !== size ||
        existing.sha256 !== sha256
      ) {
        return yield* failures.conflict.make({
          message: "This file ID is already reserved for a different upload",
          status: 409,
        });
      }
      return;
    }
    yield* operations.create({
      resourceId: assetId,
      attributes: { ownerAggregateId, uploadSiteId, objectKey, contentType, size, sha256, ready: false },
    });
  }),
});
