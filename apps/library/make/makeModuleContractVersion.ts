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

/** Zerospin contract that updates a library module model's `state` column. */
export function makeModuleContractVersion<
  MODEL_NAME extends string,
  STATE extends IPayloadFieldDescriptor,
  ATTRIBUTES extends IShape & {
    readonly state: STATE;
  },
  ABBREVIATION extends string,
  VERSION extends string,
  MODEL extends IModel<ATTRIBUTES, ABBREVIATION, MODEL_NAME, VERSION>,
>(models: { readonly [K in MODEL_NAME]: MODEL }) {
  const modelName = (Object.keys(models) as MODEL_NAME[])[0];
  if (modelName === undefined) {
    throw new Error("makeModuleContractVersion: models must include one model");
  }
  const model = models[modelName];
  const commandName =
    `update${modelName.charAt(0).toUpperCase()}${modelName.slice(1)}State` as `update${Capitalize<MODEL_NAME>}State`;
  const command = defineCommand(commandName);
  const kebabName = modelName.replace(
    /[A-Z]/g,
    (char: string) => `-${char.toLowerCase()}`,
  );

  const payload = {
    id: primitives.foreignKey({ abbreviation: model.abbreviation }),
    state: model.attributes.state,
  };

  return makeContractVersion(command, {
    payload,
    models,
    version: "1.0.0",
    guard: Effect.fn(`${commandName}.guard`)(function* ({
      db,
      payload: guardPayload,
    }: {
      authentication: Readonly<Record<string, unknown>> | null;
      db: Readonly<Pick<IDb, "query">>;
      payload: {
        id: string;
      };
    }) {
      const row = db.query[modelName]
        .findFirst({
          where: { id: { eq: guardPayload.id } },
        })
        .sync();

      if (row === undefined) {
        return yield* new ZerospinError({
          code: `update-${kebabName}-state-not-found`,
          message: `${modelName} ${guardPayload.id} was not found`,
          status: 404,
        });
      }
    }),
    program: ({ payload: programPayload, models: programModels }) => {
      // Indexed access through `{ [K in MODEL_NAME]: MODEL }[MODEL_NAME]` does not
      // simplify inside the generic body; restate the mutations as MODEL.
      const modelMutations = programModels[modelName] as IModelMutations<MODEL>;
      return modelMutations.update({
        resourceId: programPayload.id as InferIdFromAbbreviation<ABBREVIATION>,
        attributes: {
          state: programPayload.state,
        } as Partial<InferDecodedRow<ATTRIBUTES>>,
      });
    },
  });
}
