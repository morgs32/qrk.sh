import { makeAggregateRelease } from "@zerospin/sdk";
import { wallV2 as Wall } from "./models/wall/WallV2";
import { brickV2 as Brick } from "./models/brick/BrickV2";
import { placementV2 as Placement } from "./models/placement/PlacementV2";
import { pageV1 as Page } from "./models/page/PageV1";
import { pageSnapshotV3 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV3";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";
import { generateBrickSpecExternalV3 as generateBrickSpecExternal } from "./contracts/brick/GenerateBrickSpecExternalV3";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { userActorV9 } from "./actors/userActorV9";
import { user } from "./user";

export const userAggregateV9 = makeAggregateRelease(user, {
  version: 9,
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
  actors: { web: userActorV9 },
});
