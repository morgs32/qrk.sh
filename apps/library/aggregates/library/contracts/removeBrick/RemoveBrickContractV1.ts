import type { IDb } from "@zerospin/core/drizzle/types";
import { makeContractVersion } from "@zerospin/core/contracts/makeContractVersion";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { ZerospinError } from "@zerospin/error";
import {
  primitives,
  type InferIdFromAbbreviation,
} from "@zerospin/schema";
import { Effect } from "effect";

import { placementIdFor } from "../../layout/placementIdFor";
import { makeBrickModel } from "../../models/brick/makeBrickModel";
import { makePlacementModel } from "../../models/placement/placementModelV1";
import { wallModelV1 } from "../../models/wall/wallModelV1";
import { removeBrick } from "./removeBrick";

export function makeRemoveBrickContract(props: {
  wall: typeof wallModelV1;
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  const removeBrickPayload = {
    brickId: primitives.foreignKey({
      abbreviation: props.brick.abbreviation,
    }),
    wallId: primitives.foreignKey({ abbreviation: props.wall.abbreviation }),
  };

  return makeContractVersion(removeBrick, {
    payload: removeBrickPayload,
    models: {
      wall: props.wall,
      brick: props.brick,
      placement: props.placement,
    },
    version: "1.0.0",
    guard: Effect.fn("removeBrick.guard")(function* ({
      db,
      payload,
    }: {
      authentication: Readonly<Record<string, unknown>> | null;
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
        const mutations = [];

        for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<
          "sm" | "md" | "lg" | "xl"
        >) {
          mutations.push(
            yield* models.placement.delete({
              resourceId: placementIdFor(
                payload.brickId,
                breakpoint,
              ) as InferIdFromAbbreviation<"plc">,
            }),
          );
        }

        mutations.push(
          yield* models.brick.delete({
            resourceId: payload.brickId as InferIdFromAbbreviation<"brk">,
          }),
        );

        return mutations;
      }),
  });
}
