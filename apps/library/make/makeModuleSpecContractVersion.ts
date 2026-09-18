import type { IDb } from "@zerospin/core/drizzle/types";
import { defineCommand } from "@zerospin/core/contracts/Command";
import {
  makeContractVersion,
  type IPayloadFieldDescriptor,
} from "@zerospin/core/contracts/makeVersion";
import type { IModelMutations } from "@zerospin/core/contracts/types";
import type { IModel } from "@zerospin/core/models/types";
import { ZerospinError } from "@zerospin/error";
import {
  primitives,
  type InferDecodedRow,
  type InferIdFromAbbreviation,
  type IShape,
} from "@zerospin/schema";
import { Effect } from "effect";

import { placementIdFor } from "../aggregates/library/layout/placementIdFor";
import { membershipModelV1 } from "../aggregates/library/models/membership/membershipModelV1";
import { placementModelV1 } from "../aggregates/library/models/placement/placementModelV1";
import type { defineComponent } from "./defineComponent";
import { makeModuleSpecDocumentSchema } from "./makeModuleSpecDocumentSchema";

/** Per-module contract that updates one placement Spec at a breakpoint. */
export function makeModuleSpecContractVersion<
  MODEL_NAME extends string,
  STATE extends IPayloadFieldDescriptor,
  ATTRIBUTES extends IShape & {
    readonly state: STATE;
  },
  ABBREVIATION extends string,
  VERSION extends string,
  MODEL extends IModel<ATTRIBUTES, ABBREVIATION, MODEL_NAME, VERSION>,
  MODULE_ID extends string,
>(props: {
  models: { readonly [K in MODEL_NAME]: MODEL };
  moduleId: MODULE_ID;
  components: Record<string, ReturnType<typeof defineComponent>>;
}) {
  const modelName = (Object.keys(props.models) as MODEL_NAME[])[0];
  if (modelName === undefined) {
    throw new Error("makeModuleSpecContractVersion: models must include one model");
  }
  const commandName =
    `update${modelName.charAt(0).toUpperCase()}${modelName.slice(1)}SpecAtBreakpoint` as `update${Capitalize<MODEL_NAME>}SpecAtBreakpoint`;
  const command = defineCommand(commandName);
  const kebabName = modelName.replace(
    /[A-Z]/g,
    (char: string) => `-${char.toLowerCase()}`,
  );
  const SpecDocumentSchema = makeModuleSpecDocumentSchema(props.components);

  const payload = {
    membershipId: primitives.foreignKey({
      abbreviation: membershipModelV1.abbreviation,
    }),
    breakpoint: primitives.enum({
      values: ["sm", "md", "lg", "xl"],
    }),
    spec: primitives.json({ schema: SpecDocumentSchema }),
  };

  return makeContractVersion(command, {
    payload,
    models: {
      ...props.models,
      membership: membershipModelV1,
      placement: placementModelV1,
    },
    version: "1.0.0",
    guard: Effect.fn(`${commandName}.guard`)(function* ({
      db,
      payload: guardPayload,
    }: {
      authentication: Readonly<Record<string, unknown>> | null;
      db: Readonly<Pick<IDb, "query">>;
      payload: {
        membershipId: string;
        breakpoint: "sm" | "md" | "lg" | "xl";
      };
    }) {
      const membership = db.query.membership
        .findFirst({
          where: { id: { eq: guardPayload.membershipId } },
        })
        .sync();

      if (membership === undefined) {
        return yield* new ZerospinError({
          code: `update-${kebabName}-spec-membership-not-found`,
          message: `membership ${guardPayload.membershipId} was not found`,
          status: 404,
        });
      }

      if (membership.moduleId !== props.moduleId) {
        return yield* new ZerospinError({
          code: `update-${kebabName}-spec-module-mismatch`,
          message: `membership ${guardPayload.membershipId} belongs to module ${membership.moduleId}, not ${props.moduleId}`,
          status: 400,
        });
      }

      const moduleRow = db.query[modelName]
        .findFirst({
          where: { id: { eq: membership.moduleResourceId } },
        })
        .sync();

      if (moduleRow === undefined) {
        return yield* new ZerospinError({
          code: `update-${kebabName}-spec-module-row-not-found`,
          message: `${modelName} ${membership.moduleResourceId} was not found`,
          status: 404,
        });
      }

      const expectedPlacementId = placementIdFor(
        guardPayload.membershipId,
        guardPayload.breakpoint,
      );
      const placement = db.query.placement
        .findFirst({
          where: { id: { eq: expectedPlacementId } },
        })
        .sync();

      if (placement === undefined) {
        return yield* new ZerospinError({
          code: `update-${kebabName}-spec-placement-not-found`,
          message: `placement ${expectedPlacementId} was not found`,
          status: 404,
        });
      }
    }),
    program: ({ payload: programPayload, models: programModels }) => {
      // Indexed access through the generic models bag does not simplify to the
      // concrete placement model; restate mutations as the known placement version.
      const placementMutations = programModels.placement as IModelMutations<
        typeof placementModelV1
      >;
      return placementMutations.update({
        resourceId: placementIdFor(
          programPayload.membershipId,
          programPayload.breakpoint,
        ) as InferIdFromAbbreviation<"plc">,
        attributes: {
          spec: structuredClone(programPayload.spec),
        } as Partial<InferDecodedRow<(typeof placementModelV1)["attributes"]>>,
      });
    },
  });
}
