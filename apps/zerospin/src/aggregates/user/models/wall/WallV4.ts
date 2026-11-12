import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { wallLayoutSchemaV4 } from "../../layout/wallLayoutSchemaV4";
import { wallV3 } from "./WallV3";

export const wallV4 = upgradeModelVersion(wallV3, {
  version: 4,
  attributes: {
    layout: primitives.json({ schema: wallLayoutSchemaV4 }),
  },
});
