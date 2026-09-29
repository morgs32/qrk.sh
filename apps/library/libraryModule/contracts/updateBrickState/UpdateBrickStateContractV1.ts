import type { IDb } from "@zerospin/core/drizzle/types";
import { makeContractVersion } from "@zerospin/core/contracts/make/makeContractVersion";
import type { IModelMutations } from "@zerospin/core/contracts/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { mapParseError, ZerospinError } from "@zerospin/error";
import {
  makeEffectSchema,
  primitives,
  type InferIdFromAbbreviation,
  type IShape,
} from "@zerospin/schema";
import { Effect, Schema } from "effect";

import { makeBrickModel } from "../../models/brick/makeBrickModel";
import { updateBrickState } from "./updateBrickState";

export function makeUpdateBrickStateContract<
  const LIBRARY extends Record<
    string,
    {
      readonly stateShape: IShape;
    }
  >,
>(props: { library: LIBRARY; brick: ReturnType<typeof makeBrickModel> }) {
  const { library, brick } = props;
  const updateBrickStatePayload = {
    brickId: primitives.foreignKey({
      abbreviation: brick.abbreviation,
    }),
    moduleId: brick.attributes.moduleId,
    state: primitives.json({ schema: Schema.Unknown }),
  };

  return makeContractVersion(updateBrickState, {
    payload: updateBrickStatePayload,
    models: {
      brick,
    },
    version: "1.0.0",
    guard: Effect.fn("updateBrickState.guard")(function* ({
      queryDb: db,
      payload,
    }: {
      claims: Readonly<Record<string, unknown>> | null;
      queryDb: Readonly<Pick<IDb, "query">>;
      payload: InferCommandPayload<typeof updateBrickStatePayload>;
    }) {
      const brickRow = db.query.brick
        .findFirst({
          where: { id: { eq: payload.brickId } },
        })
        .sync();

      if (brickRow === undefined) {
        return yield* new ZerospinError({
          code: "update-brick-state-brick-not-found",
          message: `brick ${payload.brickId} was not found`,
          status: 404,
        });
      }

      if (payload.moduleId !== brickRow.moduleId) {
        return yield* new ZerospinError({
          code: "update-brick-state-module-mismatch",
          message: `brick ${payload.brickId} does not belong to module ${payload.moduleId}`,
          status: 400,
        });
      }

      const brickModule = library[brickRow.moduleId];
      yield* Schema.decodeUnknownEffect(Schema.toType(makeEffectSchema(brickModule.stateShape)))(
        payload.state,
        { onExcessProperty: "ignore" },
      ).pipe(
        mapParseError({
          code: "update-brick-state-invalid-state",
          prefix: `updateBrickState state failed ${brickRow.moduleId} decode`,
        }),
      );
    }),
    program: Effect.fn("updateBrickState.program")(function* ({
      payload,
      models,
    }: {
      payload: InferCommandPayload<typeof updateBrickStatePayload>;
      models: { brick: IModelMutations<typeof brick> };
    }) {
      const brickModule = library[payload.moduleId];
      const decodedState = yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(brickModule.stateShape)),
      )(payload.state, { onExcessProperty: "ignore" }).pipe(
        mapParseError({
          code: "update-brick-state-invalid-state",
          prefix: `updateBrickState state failed ${payload.moduleId} decode`,
        }),
      );
      return [
        yield* models.brick.update({
          resourceId: payload.brickId as InferIdFromAbbreviation<"brk">,
          attributes: {
            state: structuredClone(decodedState),
          },
        }),
      ];
    }),
  });
}
