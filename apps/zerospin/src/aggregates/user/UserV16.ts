import { makeAggregateRelease } from "@zerospin/sdk";
import { wallV4 as Wall } from "./models/wall/WallV4";
import { brickV4 as Brick } from "./models/brick/BrickV4";
import { placementV2 as Placement } from "./models/placement/PlacementV2";
import { pageV1 as Page } from "./models/page/PageV1";
import { pageSnapshotV7 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV7";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";
import { generateBrickSpecExternalV7 as generateBrickSpecExternal } from "./contracts/brick/GenerateBrickSpecExternalV7";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { userActorV16 } from "./actors/userActorV16";
import { user } from "./user";

export const userAggregateV16 = makeAggregateRelease(user, {
  version: 16,
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
  actors: { web: userActorV16 },
});
