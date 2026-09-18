import { prefixId } from "@zerospin/core/models/prefixId";

import { wallModelV1 } from "./models/wall/wallModelV1";

export const sandboxWallId = prefixId(wallModelV1, "sandbox");
