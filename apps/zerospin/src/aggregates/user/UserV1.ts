import { wallV1 as Wall } from "./models/wall/WallV1";
import { brickV1 as Brick } from "./models/brick/BrickV1";
import { placementV1 as Placement } from "./models/placement/PlacementV1";
import { pageV1 as Page } from "./models/page/PageV1";
import { pageSnapshotV1 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV1";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";
import { generateBrickSpecExternalV1 as generateBrickSpecExternal } from "./contracts/brick/GenerateBrickSpecExternalV1";
import { makeAggregateRelease } from "@zerospin/sdk";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { user } from "./user";
import { userActorV1 } from "./actors/userActorV1";

export const userAggregateV1 = makeAggregateRelease(user, {
  version: 1,
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
  actors: { web: userActorV1 },
});
