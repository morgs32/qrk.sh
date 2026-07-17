import { mapValues } from 'es-toolkit';
import invariant from 'tiny-invariant';

import { PrimitiveKind } from './primitiveKind.ts';
import type {
  IAnyConnectRelation,
  IModel,
  IRelationHelpers,
  IRelationsByModelKey,
} from './types.ts';

function isRefProperty(model: IModel, propertyKey: string): boolean {
  const property = model.attributes[propertyKey];
  return property?.kind === PrimitiveKind.Ref;
}

function validateOwnRef(props: {
  parentModelKey: string;
  parentModel: IModel;
  relationName: string;
  relationKind: 'one' | 'many';
  connectedModel: IModel;
  ownRef: string;
}): void {
  const {
    parentModelKey,
    parentModel,
    relationName,
    relationKind,
    connectedModel,
    ownRef,
  } = props;
  if (!isRefProperty(parentModel, ownRef)) {
    throw new Error(
      `makeRelations: ${parentModelKey}.${relationName} (${relationKind}) ownRef "${ownRef}" is not a ref property on parent model "${parentModel.modelName}"`,
    );
  }
  const parentRef = parentModel.attributes[ownRef];
  if (parentRef?.kind !== PrimitiveKind.Ref) {
    throw new Error(
      `makeRelations: ${parentModelKey}.${relationName} (${relationKind}) ownRef "${ownRef}" must be a ref`,
    );
  }
  if (parentRef.table !== connectedModel.table) {
    throw new Error(
      `makeRelations: ${parentModelKey}.${relationName} (${relationKind}) ownRef "${ownRef}" target table "${parentRef.targetTableName}" must match connected model table "${connectedModel.table.name}"`,
    );
  }
}

function validateConnectedRef(props: {
  parentModelKey: string;
  parentModel: IModel;
  relationName: string;
  relationKind: 'one' | 'many';
  connectedModel: IModel;
  connectedRef: string;
}): void {
  const {
    parentModelKey,
    parentModel,
    relationName,
    relationKind,
    connectedModel,
    connectedRef,
  } = props;
  if (!isRefProperty(connectedModel, connectedRef)) {
    throw new Error(
      `makeRelations: ${parentModelKey}.${relationName} (${relationKind}) connectedRef "${connectedRef}" is not a ref property on connected model "${connectedModel.modelName}"`,
    );
  }
  const connectedRefProperty = connectedModel.attributes[connectedRef];
  if (connectedRefProperty?.kind !== PrimitiveKind.Ref) {
    throw new Error(
      `makeRelations: ${parentModelKey}.${relationName} (${relationKind}) connectedRef "${connectedRef}" must be a ref`,
    );
  }
  if (connectedRefProperty.table !== parentModel.table) {
    throw new Error(
      `makeRelations: ${parentModelKey}.${relationName} (${relationKind}) connectedRef "${connectedRef}" target table "${connectedRefProperty.targetTableName}" must match parent model table "${parentModel.table.name}"`,
    );
  }
}

function validateRelationEntry(props: {
  parentModelKey: string;
  parentModel: IModel;
  relationName: string;
  relation: IAnyConnectRelation;
}): void {
  const { parentModelKey, parentModel, relationName, relation } = props;
  const hasOwnRef = 'ownRef' in relation && relation.ownRef !== undefined;
  const hasConnectedRef =
    'connectedRef' in relation && relation.connectedRef !== undefined;
  if (hasOwnRef === hasConnectedRef) {
    throw new Error(
      `makeRelations: ${parentModelKey}.${relationName} (${relation.kind}) must provide exactly one of ownRef or connectedRef`,
    );
  }
  if (hasOwnRef) {
    validateOwnRef({
      parentModelKey,
      parentModel,
      relationName,
      relationKind: relation.kind,
      connectedModel: relation.model,
      ownRef: relation.ownRef,
    });
    return;
  }
  validateConnectedRef({
    parentModelKey,
    parentModel,
    relationName,
    relationKind: relation.kind,
    connectedModel: relation.model,
    connectedRef: relation.connectedRef,
  });
}

export function makeRelations<
  MODELS extends Record<string, IModel>,
  RELATIONS extends IRelationsByModelKey<MODELS>,
>(
  models: MODELS,
  builder: (helpers: IRelationHelpers) => RELATIONS,
): RELATIONS {
  const relations = builder({
    connectOne: ((props: Parameters<IRelationHelpers['connectOne']>[0]) => {
      const { model } = props;
      if ('ownRef' in props) {
        const ownRef = props.ownRef;
        return {
          kind: 'one',
          model,
          ownRef,
        };
      }
      const connectedRef = props.connectedRef;
      return {
        kind: 'one',
        model,
        connectedRef,
      };
    }) as IRelationHelpers['connectOne'],
    connectMany: ((props: Parameters<IRelationHelpers['connectMany']>[0]) => {
      const { model } = props;
      if ('ownRef' in props) {
        const ownRef = props.ownRef;
        return {
          kind: 'many',
          model,
          ownRef,
        };
      }
      const connectedRef = props.connectedRef;
      return {
        kind: 'many',
        model,
        connectedRef,
      };
    }) as IRelationHelpers['connectMany'],
  });

  mapValues(relations, (modelRelations, modelId) => {
    const modelIdString = String(modelId);
    const modelKey = modelId as keyof MODELS & string;
    const parentModel = models[modelKey];
    invariant(
      parentModel,
      `makeRelations: model "${modelIdString}" is undefined`,
    );
    invariant(
      modelRelations,
      `makeRelations: model "${modelIdString}" has no relations`,
    );
    mapValues(modelRelations, (relation, relationName) => {
      invariant(
        relation,
        `makeRelations: relation "${modelIdString}.${String(relationName)}" is undefined`,
      );
      validateRelationEntry({
        parentModelKey: modelIdString,
        parentModel,
        relationName: String(relationName),
        relation,
      });
      return relation;
    });
    return modelRelations;
  });

  return relations;
}
