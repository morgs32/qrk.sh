import { mapParseError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/shapes';
import { Effect, Schema } from 'effect';

import type { IModel } from '../../models/types.ts';
import { emitOperation } from '../operationSink.ts';
import type { IModelOperations } from '../types.ts';
/** Bind operation construction to the contract's exact authored model version. */
export function makeModelOperations<MODEL extends IModel>(
  model: MODEL,
): IModelOperations<MODEL>;
export function makeModelOperations(model: IModel): IModelOperations<IModel> {
  const { version, modelName, attributes: declaredAttributes } = model;
  return {
    create(props) {
      const modelVersion = version;
      return Effect.gen(function* () {
        yield* Schema.decodeUnknownEffect(
          Schema.toType(makeEffectSchema(declaredAttributes)),
        )(props.attributes, {
          onExcessProperty: 'error',
        }).pipe(
          mapParseError({
            code: 'create-resource-missing-attributes',
            prefix: `createOperation requires all model attributes for "${modelName}"`,
            extra: { modelName },
          }),
          Effect.asVoid,
        );
        return yield* emitOperation({
          model,
          modelVersion,
          operationName: 'create',
          resourceId: props.resourceId,
          body: { attributes: props.attributes },
        });
      });
    },
    update(props) {
      const modelVersion = version;
      return Effect.gen(function* () {
        const filteredAttributes = props.mask
          ? props.mask.reduce(
              (attributes: Record<string, unknown>, key: string) => {
                attributes[key] = props.attributes[key];
                return attributes;
              },
              {},
            )
          : props.attributes;
        return yield* emitOperation({
          model,
          modelVersion,
          operationName: 'update',
          resourceId: props.resourceId,
          body: props.mask
            ? { attributes: filteredAttributes, mask: [...props.mask] }
            : { attributes: filteredAttributes },
        });
      });
    },
    delete(props) {
      const modelVersion = version;
      return Effect.gen(function* () {
        return yield* emitOperation({
          model,
          modelVersion,
          operationName: 'delete',
          resourceId: props.resourceId,
          body: {},
        });
      });
    },
    move(props) {
      const modelVersion = version;
      return Effect.gen(function* () {
        return yield* emitOperation({
          model,
          modelVersion,
          operationName: 'move',
          resourceId: props.resourceId,
          body: {
            property: props.property,
            prevId: props.prevId,
            nextId: props.nextId,
          },
        });
      });
    },
  };
}
