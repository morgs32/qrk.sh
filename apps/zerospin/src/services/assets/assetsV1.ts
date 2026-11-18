import { defineService, makeServiceRelease } from "@zerospin/sdk";
import { assetV1 } from "./AssetV1";
import { markAssetReadyV1 } from "./MarkAssetReadyV1";
import { reserveAssetV1 } from "./ReserveAssetV1";

const assets = defineService({ name: "assets" });

export const assetsV1 = makeServiceRelease(assets, {
  version: 1,
  models: { asset: assetV1 },
  actors: {},
  system: { reserveAsset: reserveAssetV1, markAssetReady: markAssetReadyV1 },
});
