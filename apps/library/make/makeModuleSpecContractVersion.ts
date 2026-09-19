import type { IDb } from "@zerospin/core/drizzle/types";
import { defineContract } from "@zerospin/core/contracts/defineContract";
import { makeContractVersion } from "@zerospin/core/contracts/makeContractVersion";
import type { IModelMutations } from "@zerospin/core/contracts/types";
import { ZerospinError } from "@zerospin/error";
import {
  primitives,
  type InferDecodedRow,
  type InferIdFromAbbreviation,
} from "@zerospin/schema";
import { Effect } from "effect";

import { placementIdFor } from "../aggregates/library/layout/placementIdFor";
import { makeBrickModel } from "../aggregates/library/models/brick/makeBrickModel";
import { makePlacementModel } from "../aggregates/library/models/placement/placementModelV1";
import type { defineComponent } from "./defineComponent";
import { makeModuleSpecDocumentSchema } from "./makeModuleSpecDocumentSchema";

/** Per-module contract that updates one placement Spec at a breakpoint. */
export function makeModuleSpecContractVersion<
  const COMMAND_NAME extends string,
  const MODULE_ID extends string,
>(props: {
  commandName: COMMAND_NAME;
  moduleId: MODULE_ID;
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
  components: Record<string, ReturnType<typeof defineComponent>>;
}) {
  const command = defineContract(props.commandName);
  const SpecDocumentSchema = makeModuleSpecDocumentSchema(props.components);

  const payload = {
    brickId: primitives.foreignKey({
      abbreviation: props.brick.abbreviation,
    }),
    breakpoint: primitives.enum({
      values: ["sm", "md", "lg", "xl"],
    }),
    spec: primitives.json({ schema: SpecDocumentSchema }),
  };

  return makeContractVersion(command, {
    payload,
    models: {
      brick: props.brick,
      placement: props.placement,
    },
    version: "1.0.0",
    guard: Effect.fn(`${props.commandName}.guard`)(function* ({
      db,
      payload: guardPayload,
    }: {
      authentication: Readonly<Record<string, unknown>> | null;
      db: Readonly<Pick<IDb, "query">>;
      payload: {
        brickId: string;
        breakpoint: "sm" | "md" | "lg" | "xl";
      };
    }) {
      const brickRow = db.query.brick
        .findFirst({
          where: { id: { eq: guardPayload.brickId } },
        })
        .sync();

      if (brickRow === undefined) {
        return yield* new ZerospinError({
          code: `update-${props.moduleId}-spec-brick-not-found`,
          message: `brick ${guardPayload.brickId} was not found`,
          status: 404,
        });
      }

      if (brickRow.moduleId !== props.moduleId) {
        return yield* new ZerospinError({
          code: `update-${props.moduleId}-spec-module-mismatch`,
          message: `brick ${guardPayload.brickId} belongs to module ${brickRow.moduleId}, not ${props.moduleId}`,
          status: 400,
        });
      }

      const expectedPlacementId = placementIdFor(
        guardPayload.brickId,
        guardPayload.breakpoint,
      );
      const placement = db.query.placement
        .findFirst({
          where: { id: { eq: expectedPlacementId } },
        })
        .sync();

      if (placement === undefined) {
        return yield* new ZerospinError({
          code: `update-${props.moduleId}-spec-placement-not-found`,
          message: `placement ${expectedPlacementId} was not found`,
          status: 404,
        });
      }
    }),
    program: ({ payload: programPayload, models: programModels }) => {
      const placementMutations = programModels.placement as IModelMutations<
        typeof props.placement
      >;
      return placementMutations.update({
        resourceId: placementIdFor(
          programPayload.brickId,
          programPayload.breakpoint,
        ) as InferIdFromAbbreviation<"plc">,
        attributes: {
          spec: structuredClone(programPayload.spec),
        } as Partial<InferDecodedRow<(typeof props.placement)["attributes"]>>,
      });
    },
  });
}
