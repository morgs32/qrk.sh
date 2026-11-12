import { makeAggregateRelease } from "@zerospin/sdk";
import { wallV4 as Wall } from "./models/wall/WallV4";
import { brickV5 as Brick } from "./models/brick/BrickV5";
import { placementV2 as Placement } from "./models/placement/PlacementV2";
import { pageV1 as Page } from "./models/page/PageV1";
import { pageSnapshotV8 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV8";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";
import { generateBrickSpecExternalV8 as generateBrickSpecExternal } from "./contracts/brick/GenerateBrickSpecExternalV8";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { userActorV18 } from "./actors/userActorV18";
import { user } from "./user";

export const userAggregateV18 = makeAggregateRelease(user, {
  version: 18,
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
  actors: { web: userActorV18 },
});
