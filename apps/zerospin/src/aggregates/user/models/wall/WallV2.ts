import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { wallLayoutSchemaV2 } from "../../layout/wallLayoutSchemaV2";
import { wallV1 } from "./WallV1";

export const wallV2 = upgradeModelVersion(wallV1, {
  version: 2,
  attributes: {
    layout: primitives.json({ schema: wallLayoutSchemaV2 }),
  },
});
