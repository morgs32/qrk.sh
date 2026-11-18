import {
  ContractError,
  defineServiceContract,
  findFirst,
  makeServiceContractRelease,
  modelId,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { asset } from "./asset";
import { assetV1 } from "./AssetV1";

export const markAssetReadyV1 = makeServiceContractRelease(defineServiceContract("markAssetReady"), {
  version: 1,
  payload: { assetId: modelId({ model: asset }) },
  models: { asset: { model: assetV1, fields: ["ready"] } },
  operations: { update: assetV1.operations.update },
  failures: { missing: ContractError.schema({ code: "asset-reservation-missing" }) },
  program: Effect.fn("assets.markAssetReady")(function* (props) {
    const { payload, db, operations, failures } = props;
    const existing = yield* findFirst({
      db,
      model: db.models.asset,
      where: { id: { eq: payload.assetId } },
    });
    if (existing === undefined) {
      return yield* failures.missing.make({ message: "File reservation not found", status: 404 });
    }
    if (!existing.ready) {
      yield* operations.update({ resourceId: existing.id, attributes: { ready: true } });
    }
  }),
});
