import { defineAggregate, makeAggregateRelease } from "@zerospin/sdk";
import { brickV1 } from "@qrk.sh/bricks/zerospin/models/brick/BrickV1";
import { pageV1 } from "@qrk.sh/bricks/zerospin/models/page/PageV1";
import { pageSnapshotV1 } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/PageSnapshotV1";
import { placementV1 } from "@qrk.sh/bricks/zerospin/models/placement/PlacementV1";
import { siteV1 } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";
import { userV1 } from "@qrk.sh/bricks/zerospin/models/user/UserV1";
import { wallV1 } from "@qrk.sh/bricks/zerospin/models/wall/WallV1";
import { createUserV1 } from "./contracts/CreateUserV1";
import { userActorV1 } from "./userActorV1";

export const userAggregateV1 = makeAggregateRelease(defineAggregate({ name: "user" }), {
  version: 1,
  models: {
    wall: wallV1,
    brick: brickV1,
    placement: placementV1,
    page: pageV1,
    pageSnapshot: pageSnapshotV1,
    site: siteV1,
    user: userV1,
  },
  system: { createUser: createUserV1 },
  external: {},
  actors: { web: userActorV1 },
});
