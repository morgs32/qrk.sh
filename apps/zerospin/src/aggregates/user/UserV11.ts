import { makeAggregateRelease } from "@zerospin/sdk";
import { wallV3 as Wall } from "./models/wall/WallV3";
import { brickV2 as Brick } from "./models/brick/BrickV2";
import { placementV2 as Placement } from "./models/placement/PlacementV2";
import { pageV1 as Page } from "./models/page/PageV1";
import { pageSnapshotV4 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV4";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";
import { generateBrickSpecExternalV4 as generateBrickSpecExternal } from "./contracts/brick/GenerateBrickSpecExternalV4";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { userActorV11 } from "./actors/userActorV11";
import { user } from "./user";

export const userAggregateV11 = makeAggregateRelease(user, {
  version: 11,
  models: {
    wall: Wall,
    brick: Brick,
    placement: Placement,
    page: Page,
    pageSnapshot: PageSnapshot,
    site: Site,
    user: User,
  },
  system: { createUser },
  external: { generateBrickSpecExternal },
  actors: { web: userActorV11 },
});
