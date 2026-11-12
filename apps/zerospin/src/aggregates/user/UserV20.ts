import { makeAggregateRelease } from "@zerospin/sdk";
import { wallV4 as Wall } from "./models/wall/WallV4";
import { brickV6 as Brick } from "./models/brick/BrickV6";
import { placementV2 as Placement } from "./models/placement/PlacementV2";
import { pageV1 as Page } from "./models/page/PageV1";
import { pageSnapshotV9 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV9";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";
import { generateBrickSpecExternalV9 as generateBrickSpecExternal } from "./contracts/brick/GenerateBrickSpecExternalV9";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { userActorV20 } from "./actors/userActorV20";
import { user } from "./user";

export const userAggregateV20 = makeAggregateRelease(user, {
  version: 20,
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
  actors: { web: userActorV20 },
});
