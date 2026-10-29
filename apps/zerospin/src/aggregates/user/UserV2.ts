import { wallV1 as Wall } from "./models/wall/WallV1";
import { brickV2 as Brick } from "./models/brick/BrickV2";
import { placementV1 as Placement } from "./models/placement/PlacementV1";
import { pageV1 as Page } from "./models/page/PageV1";
import { pageSnapshotV2 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV2";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";
import { generateBrickSpecExternalV2 as generateBrickSpecExternal } from "./contracts/brick/GenerateBrickSpecExternalV2";
import { makeAggregateRelease } from "@zerospin/sdk";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { user } from "./user";
import { userActorV2 } from "./actors/userActorV2";

export const userAggregateV2 = makeAggregateRelease(user, {
  version: 2,
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
  actors: { web: userActorV2 },
});
