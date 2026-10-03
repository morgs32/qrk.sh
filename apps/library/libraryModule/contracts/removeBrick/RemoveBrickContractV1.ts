import type { IDb } from "@zerospin/core/drizzle/types";
import { makeContractVersion } from "@zerospin/core/contracts/make/makeContractVersion";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { ZerospinError } from "@zerospin/error";
import { primitives, type InferIdFromAbbreviation } from "@zerospin/schema";
import { Effect } from "effect";

import { makePlacementId } from "../../models/placement/makePlacementId";
import { makeBrickModel } from "../../models/brick/makeBrickModel";
import { makePlacementModel } from "../../models/placement/placementModelV1";
import { wallModelV1 } from "../../models/wall/wallModelV1";
import { removeBrick } from "./removeBrick";

export function makeRemoveBrickContract(props: {
  wall: typeof wallModelV1;
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  const { wall, brick, placement } = props;
  const removeBrickPayload = {
    brickId: primitives.foreignKey({
      abbreviation: brick.abbreviation,
    }),
    wallId: primitives.foreignKey({ abbreviation: wall.abbreviation }),
  };

  return makeContractVersion(removeBrick, {
    payload: removeBrickPayload,
    models: {
      wall,
      brick,
      placement,
    },
    version: "1.0.0",
    guard: Effect.fn("removeBrick.guard")(function* ({
      db,
      payload,
    }: {
      claims: Readonly<Record<string, unknown>> | null;
      db: Readonly<Pick<IDb, "query">>;
      payload: InferCommandPayload<typeof removeBrickPayload>;
    }) {
      const wall = db.query.wall
        .findFirst({
          where: { id: { eq: payload.wallId } },
        })
        .sync();

      if (wall === undefined) {
        return yield* new ZerospinError({
          code: "remove-brick-wall-not-found",
          message: `wall ${payload.wallId} was not found`,
          status: 404,
        });
      }

      const brickRow = db.query.brick
        .findFirst({
          where: { id: { eq: payload.brickId } },
        })
        .sync();

      if (brickRow === undefined) {
        return yield* new ZerospinError({
          code: "remove-brick-brick-not-found",
          message: `brick ${payload.brickId} was not found`,
          status: 404,
        });
      }

      if (brickRow.wallId !== payload.wallId) {
        return yield* new ZerospinError({
          code: "remove-brick-wall-mismatch",
          message: `brick ${payload.brickId} does not belong to wall ${payload.wallId}`,
          status: 400,
        });
      }
    }),
    program: ({ payload, models }) =>
      Effect.gen(function* () {
        for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<"sm" | "md" | "lg" | "xl">) {
          yield* models.placement.delete({
            resourceId: makePlacementId(
              payload.brickId,
              breakpoint,
            ) as InferIdFromAbbreviation<"plc">,
          });
        }

        yield* models.brick.delete({
          resourceId: payload.brickId as InferIdFromAbbreviation<"brk">,
        });
      }),
  });
}
