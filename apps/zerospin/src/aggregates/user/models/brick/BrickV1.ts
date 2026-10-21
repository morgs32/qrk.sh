import { makeBrickModel } from "@qrk.sh/library/makeBrickModel";
import { brick } from "./brick";
import { page } from "../page/page";

export const brickV1 = makeBrickModel({ page, identity: brick });
