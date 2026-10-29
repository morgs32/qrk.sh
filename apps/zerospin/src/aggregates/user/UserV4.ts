import { makeAggregateRelease } from "@zerospin/sdk";
import { wallV1 as Wall } from "./models/wall/WallV1";
import { brickV2 as Brick } from "./models/brick/BrickV2";
import { placementV1 as Placement } from "./models/placement/PlacementV1";
import { pageV1 as Page } from "./models/page/PageV1";
import { pageSnapshotV2 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV2";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";
import { generateBrickSpecExternalV2 as generateBrickSpecExternal } from "./contracts/brick/GenerateBrickSpecExternalV2";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { userActorV4 } from "./actors/userActorV4";
import { user } from "./user";

export const userAggregateV4 = makeAggregateRelease(user, {
  version: 4,
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
  actors: { web: userActorV4 },
});
