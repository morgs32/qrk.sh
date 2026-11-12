import {
  DownAdapterRefused,
  findFirst,
  makeIdSchema,
  primitives,
  upgradeAggregateContractRelease,
} from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
import { placementV2 } from "../../models/placement/PlacementV2";
import { deleteStackV1 } from "./DeleteStackContractV1";

export const deleteStackV2 = upgradeAggregateContractRelease(deleteStackV1, {
  version: 2,
  payload: {
    placementIds: primitives.json({
      schema: Schema.Array(makeIdSchema(placementV2)),
      nullable: true,
    }),
  },
  up: Effect.fn("deleteStackV2.up")(function* (props) {
    const { payload } = props;
    return { ...payload, placementIds: null };
  }),
  down: Effect.fn("deleteStackV2.down")(function* (props) {
    const { payload } = props;
    const { placementIds, ...legacy } = payload;
    if (placementIds !== null) return DownAdapterRefused;
    return legacy;
  }),
  guard: Effect.fn("deleteStackV2.guard")(function* (props) {
    const { db, failures, payload } = props;
    const { placementIds, stackId, wallId } = payload;
    if (placementIds === null) return;
    const wall = yield* findFirst({ db, model: db.models.wall, where: { id: { eq: wallId } } });
    const stack = wall?.layout.sections
      .flatMap((section) => section.stacks)
      .find((entry) => entry.id === stackId);
    if (stack === undefined) return;
    const currentIds = stack.rows.flatMap((row) => row.placementIds);
    if (
      currentIds.length !== placementIds.length ||
      !currentIds.every((id) => placementIds.includes(id))
    )
      return yield* failures.invalidStack.make({
        message: "The Stack changed. Open Delete stack again to review it.",
        status: 409,
      });
  }),
});
