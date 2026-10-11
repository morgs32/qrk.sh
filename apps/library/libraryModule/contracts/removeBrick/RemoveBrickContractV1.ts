import { ContractError } from "@zerospin/error";
import { findMany } from "@zerospin/core/contracts/findMany";
import { findFirst } from "@zerospin/core/contracts/findFirst";
import type { IOperation } from "@zerospin/core/contracts/types";
import { makeUpdateOperation } from "@zerospin/core/contracts/make/makeUpdateOperation";
import { makeDeleteOperation } from "@zerospin/core/contracts/make/makeDeleteOperation";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { ZerospinError } from "@zerospin/error";
import { primitives, type InferDecodedRow, type InferIdFromAbbreviation } from "@zerospin/shapes";
import { Channel, Effect } from "effect";

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

  return makeAggregateContractVersion(removeBrick, {
    failures: {
      removeBrickWallNotFound: ContractError.schema({ code: "remove-brick-wall-not-found" }),
      removeBrickBrickNotFound: ContractError.schema({ code: "remove-brick-brick-not-found" }),
      removeBrickWallMismatch: ContractError.schema({ code: "remove-brick-wall-mismatch" }),
    },

    payload: removeBrickPayload,
    models: {
      wall,
      brick,
      placement,
    },
    version: "1.0.0",
    guard: Effect.fn("removeBrick.guard")(function* (props) {
      const { failures, db, payload } = props;

      const wallRow = yield* findFirst({
        db: db,
        model: wall,
        where: { id: { eq: payload.wallId } },
      });

      if (wallRow === undefined) {
        return yield* failures.removeBrickWallNotFound.make({
          message: `wall ${payload.wallId} was not found`,
          status: 404,
        });
      }

      const brickRow = yield* findFirst({
        db: db,
        model: brick,
        where: { id: { eq: payload.brickId } },
      });

      if (brickRow === undefined) {
        return yield* failures.removeBrickBrickNotFound.make({
          message: `brick ${payload.brickId} was not found`,
          status: 404,
        });
      }

      if (brickRow.wallId !== payload.wallId) {
        return yield* failures.removeBrickWallMismatch.make({
          message: `brick ${payload.brickId} does not belong to wall ${payload.wallId}`,
          status: 400,
        });
      }
    }),
    program: (props) => {
      const { payload, db } = props;
      return Channel.unwrap(
        Effect.gen(function* () {
          const operations: Channel.Channel<
            IOperation<typeof placement | typeof brick>,
            ZerospinError,
            void
          >[] = [];
          // Emitted deletes are not applied to db during this program.
          const wallBricks = (yield* findMany({
            db: db,
            model: brick,
            where: { wallId: { eq: payload.wallId } },
          })).filter((brickRow) => brickRow.id !== payload.brickId);

          for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<"sm" | "md" | "lg" | "xl">) {
            operations.push(
              makeDeleteOperation({
                model: placement,
                resourceId: makePlacementId(
                  payload.brickId,
                  breakpoint,
                ) as InferIdFromAbbreviation<"plc">,
              }),
            );

            const visiblePlacements = [];
            for (const wallBrick of wallBricks) {
              const wallPlacement = yield* findFirst({
                db: db,
                model: placement,
                where: { id: { eq: makePlacementId(wallBrick.id, breakpoint) } },
              });
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

              operations.push(
                makeUpdateOperation({
                  model: placement,
                  resourceId: makePlacementId(item.i, breakpoint) as InferIdFromAbbreviation<"plc">,
                  attributes: {
                    gridItem: item,
                  } as Partial<InferDecodedRow<(typeof placement)["attributes"]>>,
                }),
              );
            }
          }

          operations.push(
            makeDeleteOperation({
              model: brick,
              resourceId: payload.brickId as InferIdFromAbbreviation<"brk">,
            }),
          );

          return Channel.fromIterable(operations).pipe(Channel.flatMap((operation) => operation));
        }),
      );
    },
  });
}
