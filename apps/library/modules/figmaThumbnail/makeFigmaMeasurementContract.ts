import { findFirst } from "@zerospin/core/contracts/findFirst";
import { defineAggregateContract } from "@zerospin/core/contracts/defineAggregateContract";
import { makeAggregateContractVersion } from "@zerospin/core/contracts/make/makeAggregateContractVersion";
import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { Effect, Schema } from "effect";
import type { makeBrickModel } from "../../libraryModule/models/brick/makeBrickModel";
import type { makePlacementModel } from "../../libraryModule/models/placement/placementModelV1";
import { makePlacementId } from "../../libraryModule/models/placement/makePlacementId";
import { figmaThumbnailV1 } from "./figmaThumbnailV1";

export function makeFigmaMeasurementContract(props: {
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  const { brick, placement } = props;
  const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];
  const measurement = Schema.Struct({
    specRevision: Schema.Int,
    dimensions: placement.attributes.measured.schema,
  });
  const State = Schema.toType(makeEffectSchema(figmaThumbnailV1.stateShape));
  return makeAggregateContractVersion(defineAggregateContract("measureFigmaThumbnail"), {
    version: "1.0.0",
    models: { brick, placement },
    operations: { updatePlacement: placement.operations.update },
    payload: {
      brickId: primitives.foreignKey({ abbreviation: brick.abbreviation }),
      stateRevision: primitives.integer(),
      measurements: primitives.json({
        schema: Schema.Struct({
          sm: measurement,
          md: measurement,
          lg: measurement,
          xl: measurement,
        }),
      }),
    },
    program: Effect.fn("measureFigmaThumbnail.program")(function* (props) {
      const { db, payload, operations } = props;
      const row = yield* findFirst({ db, model: brick, where: { id: { eq: payload.brickId } } });
      if (
        row === undefined ||
        row.moduleId !== "figma-thumbnail" ||
        row.stateRevision !== payload.stateRevision
      )
        return;
      const state = Schema.decodeUnknownResult(State)(row.state);
      if (
        state._tag === "Failure" ||
        state.success.resolution.status !== "ready" ||
        state.success.data === null
      )
        return;
      // Validate every baseline before emitting the four placement measurements.
      for (const breakpoint of breakpoints) {
        const current = yield* findFirst({
          db,
          model: placement,
          where: { id: { eq: makePlacementId(row.id, breakpoint) } },
        });
        if (
          current === undefined ||
          current.specRevision !== payload.measurements[breakpoint].specRevision
        )
          return;
      }
      for (const breakpoint of breakpoints) {
        yield* operations.updatePlacement({
          resourceId: makePlacementId(row.id, breakpoint),
          attributes: { measured: payload.measurements[breakpoint].dimensions },
        });
      }
    }),
  });
}
