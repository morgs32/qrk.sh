import { makeBrickModel } from "@qrk.sh/library/makeBrickModel";
import { brick } from "./brick";
import { pageV3 } from "../page/PageV3";

export const brickV1 = makeBrickModel({ page: pageV3, identity: brick });
