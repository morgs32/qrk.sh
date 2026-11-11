import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { wallLayoutSchemaV3 } from "../../layout/wallLayoutSchemaV3";
import { wallV2 } from "./WallV2";

export const wallV3 = upgradeModelVersion(wallV2, {
  version: 3,
  attributes: {
    layout: primitives.json({ schema: wallLayoutSchemaV3 }),
  },
});
