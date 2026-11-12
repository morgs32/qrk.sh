import { makeAggregateRelease } from "@zerospin/sdk";
import { wallV3 as Wall } from "./models/wall/WallV3";
import { brickV3 as Brick } from "./models/brick/BrickV3";
import { placementV2 as Placement } from "./models/placement/PlacementV2";
import { pageV1 as Page } from "./models/page/PageV1";
import { pageSnapshotV5 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV5";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";
import { generateBrickSpecExternalV5 as generateBrickSpecExternal } from "./contracts/brick/GenerateBrickSpecExternalV5";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { userActorV14 } from "./actors/userActorV14";
import { user } from "./user";

export const userAggregateV14 = makeAggregateRelease(user, {
  version: 14,
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
  actors: { web: userActorV14 },
});
