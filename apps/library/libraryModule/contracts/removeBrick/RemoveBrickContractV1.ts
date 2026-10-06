import type { IDb } from "@zerospin/core/drizzle/types";
import { makeContractVersion } from "@zerospin/core/contracts/make/makeContractVersion";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { ZerospinError } from "@zerospin/error";
import { primitives, type InferDecodedRow, type InferIdFromAbbreviation } from "@zerospin/shapes";
import { Effect } from "effect";

import { makePlacementId } from "../../models/placement/makePlacementId";
import { makeCompactLayout } from "../../resolveVisibleCollisions";
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
    program: (props) => {
      const { payload, models, db } = props;
      return Effect.gen(function* () {
        // Emitted deletes are not applied to db during this program.
        const wallBricks = db.query.brick
          .findMany({ where: { wallId: { eq: payload.wallId } } })
          .sync()
          .filter((brickRow) => brickRow.id !== payload.brickId);

        for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<"sm" | "md" | "lg" | "xl">) {
          yield* models.placement.delete({
            resourceId: makePlacementId(
              payload.brickId,
              breakpoint,
            ) as InferIdFromAbbreviation<"plc">,
          });

          const visiblePlacements = [];
          for (const wallBrick of wallBricks) {
            const wallPlacement = db.query.placement
              .findFirst({ where: { id: { eq: makePlacementId(wallBrick.id, breakpoint) } } })
              .sync();
            if (wallPlacement !== undefined && wallPlacement.isVisible) {
              visiblePlacements.push(wallPlacement);
            }
          }

          const compacted = makeCompactLayout(
            visiblePlacements.map((wallPlacement) => wallPlacement.gridItem),
          );
          for (const item of compacted) {
            const stored = visiblePlacements.find(
              (wallPlacement) => wallPlacement.gridItem.i === item.i,
            )?.gridItem;
            if (
              stored?.i === item.i &&
              stored.x === item.x &&
              stored.y === item.y &&
              stored.w === item.w &&
              stored.h === item.h
            ) {
              continue;
            }

            yield* models.placement.update({
              resourceId: makePlacementId(item.i, breakpoint) as InferIdFromAbbreviation<"plc">,
              attributes: {
                gridItem: item,
              } as Partial<InferDecodedRow<(typeof placement)["attributes"]>>,
            });
          }
        }

        yield* models.brick.delete({
          resourceId: payload.brickId as InferIdFromAbbreviation<"brk">,
        });
      });
    },
  });
}
