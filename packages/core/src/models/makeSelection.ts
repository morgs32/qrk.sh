import {
  and,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  type SQL,
  type SQLWrapper,
  type Table,
} from 'drizzle-orm';
import type { UnionToIntersection } from 'type-fest';

import { PrimitiveKind } from './primitiveKind.ts';
import type {
  IActorId,
  IAnyPrimitiveDescriptor,
  IAnyRefDescriptor,
  IAnyShape,
  IModel,
  IModels,
  InferDecodedRow,
  InferProperties,
} from './types.ts';

type InferPropertiesShape<MODEL extends IModel> = InferProperties<
  MODEL['attributes'],
  MODEL['abbreviation']
>;

type RefRelationName<
  PROPS extends IAnyShape,
  P extends keyof PROPS & string,
> = PROPS[P] extends IAnyRefDescriptor ? PROPS[P]['relation'] : never;

type RefRelationNames<PROPS extends IAnyShape> = RefRelationName<
  PROPS,
  keyof PROPS & string
>;

type RefDescriptorForRelation<PROPS extends IAnyShape, REL extends string> = {
  [P in keyof PROPS & string]: PROPS[P] extends IAnyRefDescriptor
    ? PROPS[P]['relation'] extends REL
      ? PROPS[P]
      : never
    : never;
}[keyof PROPS & string];

type ScalarFilterValue<T> =
  | T
  | null
  | {
      eq?: T;
      ne?: T;
      gt?: T;
      gte?: T;
      lt?: T;
      lte?: T;
      in?: readonly T[];
    };

type ScalarWhereEntry<
  PROPS extends IAnyShape,
  K extends keyof PROPS & string,
> = ScalarFilterValue<InferDecodedRow<PROPS>[K]>;

type SelectionScalarWhere<PROPS extends IAnyShape> = {
  [K in keyof PROPS & string as K extends RefRelationNames<PROPS>
    ? never
    : K]?: ScalarWhereEntry<PROPS, K>;
};

type SelectionRelationWhere<MODEL extends IModel, MODELS extends IModels> = {
  [REL in RefRelationNames<MODEL['attributes']> as REL extends string
    ? REL
    : never]?: MODEL['attributes'] extends infer _PROPS
    ? _PROPS extends IAnyShape
      ? RefDescriptorForRelation<_PROPS, REL & string> extends IAnyRefDescriptor
        ? ISelectionWhereForRef<
            RefDescriptorForRelation<_PROPS, REL & string>,
            MODELS
          >
        : never
      : never
    : never;
} & UnionToIntersection<
  {
    [MODEL_KEY in keyof MODELS]: {
      [ATTRIBUTE_KEY in keyof MODELS[MODEL_KEY]['attributes'] &
        string as MODELS[MODEL_KEY]['attributes'][ATTRIBUTE_KEY] extends infer DESCRIPTOR extends
        IAnyRefDescriptor
        ? DESCRIPTOR['targetTableName'] extends MODEL['modelName']
          ? DESCRIPTOR['inverse']
          : never
        : never]?: ISelectionWhere<MODELS[MODEL_KEY], MODELS>;
    };
  }[keyof MODELS]
>;

type ISelectionWhereForRef<
  REF extends IAnyRefDescriptor,
  MODELS extends IModels,
> = ISelectionWhere<
  Extract<MODELS[keyof MODELS], { table: REF['table'] }>,
  MODELS
>;

export type ISelectionWhere<
  MODEL extends IModel = IModel,
  MODELS extends IModels = IModels,
> = SelectionScalarWhere<
  InferProperties<MODEL['attributes'], MODEL['abbreviation']>
> &
  SelectionRelationWhere<MODEL, MODELS>;

export type ISelectionWhereProps = {
  actorId: IActorId;
};

export type ISelectionWhereFn<
  MODEL extends IModel,
  MODELS extends IModels = IModels,
> = (props: ISelectionWhereProps) => ISelectionWhere<MODEL, MODELS>;

export type ISelection<
  MODEL extends IModel,
  WHERE extends (props: ISelectionWhereProps) => Record<string, unknown> = (
    props: ISelectionWhereProps,
  ) => Record<string, unknown>,
> = {
  model: MODEL;
  where: WHERE;
};

type ISelectionDb = {
  selectDistinct: (fields: Record<string, unknown>) => {
    from: (table: unknown) => IFlatSelectBuilder;
  };
};

export type { ISelectionDb };

type IFlatSelectBuilder = {
  innerJoin: (table: unknown, condition: SQL) => IFlatSelectBuilder;
  leftJoin: (table: unknown, condition: SQL) => IFlatSelectBuilder;
  where: (condition: SQL | undefined) => IFlatSelectBuilder;
  toSQL: () => { sql: string; params: unknown[] };
  all: () => unknown[];
};

function asSqlColumn(column: unknown): SQLWrapper {
  return column as SQLWrapper;
}

function asTableColumns(table: unknown): Record<string, unknown> {
  return getTableColumns(table as Table) as Record<string, unknown>;
}

function isRefDescriptor(
  descriptor: IAnyPrimitiveDescriptor | undefined,
): descriptor is IAnyRefDescriptor {
  return descriptor?.kind === PrimitiveKind.Ref;
}

function getRefModelWithTable(props: {
  ref: IAnyRefDescriptor;
  models: IModels;
}): IModel {
  const { ref, models } = props;
  const model = models[ref.targetTableName];
  if (model !== undefined && model.table === ref.table) {
    return model;
  }
  throw new Error(
    `makeSelection: ref target table "${ref.targetTableName}" is not registered in models`,
  );
}

function findForwardRefByRelationName(props: {
  model: IModel;
  relationName: string;
}): { attributeName: string; descriptor: IAnyRefDescriptor } | undefined {
  const { model, relationName } = props;
  for (const [attributeName, descriptor] of Object.entries(
    model.attributes,
  ) as Array<[string, IAnyPrimitiveDescriptor]>) {
    if (!isRefDescriptor(descriptor)) {
      continue;
    }
    if (descriptor.relation === relationName) {
      return { attributeName, descriptor };
    }
  }
  return undefined;
}

function compileScalarFilter(props: {
  column: unknown;
  value: unknown;
}): SQL | undefined {
  const { column, value } = props;

  if (value === null) {
    return isNull(asSqlColumn(column));
  }

  if (
    value === undefined ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return eq(asSqlColumn(column), value);
  }
  const operators = value as Record<string, unknown>;
  const parts: SQL[] = [];

  if ('eq' in operators) {
    parts.push(eq(asSqlColumn(column), operators.eq));
  }
  if ('ne' in operators) {
    parts.push(ne(asSqlColumn(column), operators.ne));
  }
  if ('gt' in operators) {
    parts.push(gt(asSqlColumn(column), operators.gt));
  }
  if ('gte' in operators) {
    parts.push(gte(asSqlColumn(column), operators.gte));
  }
  if ('lt' in operators) {
    parts.push(lt(asSqlColumn(column), operators.lt));
  }
  if ('lte' in operators) {
    parts.push(lte(asSqlColumn(column), operators.lte));
  }
  if ('in' in operators && Array.isArray(operators.in)) {
    parts.push(inArray(asSqlColumn(column), operators.in));
  }

  if (parts.length === 0) {
    return undefined;
  }

  return parts.length === 1 ? parts[0] : and(...parts);
}

type IJoinSpec = {
  sourceColumnName: string;
  targetColumnName: string;
  nullable: boolean;
  sourceTable: unknown;
  targetModel: IModel;
};

type ICompileWhereContext = {
  joins: IJoinSpec[];
  predicates: SQL[];
};

function compileWhereForModel(props: {
  model: IModel;
  models: IModels;
  table: unknown;
  where: Record<string, unknown> | undefined;
  context: ICompileWhereContext;
}): void {
  const { model, models, table, where, context } = props;
  if (where === undefined) {
    return;
  }

  const tableColumns = asTableColumns(table);
  const propertiesShape = {
    ...model.propertiesShape,
  } as InferPropertiesShape<typeof model>;

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) {
      continue;
    }

    const forwardRef = findForwardRefByRelationName({
      model,
      relationName: key,
    });

    if (forwardRef !== undefined) {
      const targetModel = getRefModelWithTable({
        ref: forwardRef.descriptor,
        models,
      });
      const targetTable = targetModel.drizzleSchema;
      context.joins.push({
        sourceColumnName: forwardRef.attributeName,
        targetColumnName: forwardRef.descriptor.targetColumnName,
        nullable: forwardRef.descriptor.nullable,
        sourceTable: table,
        targetModel,
      });
      compileWhereForModel({
        model: targetModel,
        models,
        table: targetTable,
        where: value as Record<string, unknown>,
        context,
      });
      continue;
    }

    let inverseMatch:
      | {
          model: IModel;
          attributeName: string;
          nullable: boolean;
          sourceColumnName: string;
        }
      | undefined;
    for (const candidateModel of Object.values(models)) {
      for (const [attributeName, descriptor] of Object.entries(
        candidateModel.attributes,
      ) as Array<[string, IAnyPrimitiveDescriptor]>) {
        if (
          !isRefDescriptor(descriptor) ||
          descriptor.table !== model.table ||
          descriptor.inverse !== key
        ) {
          continue;
        }
        if (inverseMatch !== undefined) {
          throw new Error(
            `makeSelection: inverse where key "${key}" on model "${model.modelName}" is ambiguous`,
          );
        }
        inverseMatch = {
          model: candidateModel,
          attributeName,
          nullable: descriptor.nullable,
          sourceColumnName: descriptor.targetColumnName,
        };
      }
    }
    if (inverseMatch !== undefined) {
      context.joins.push({
        sourceColumnName: inverseMatch.sourceColumnName,
        targetColumnName: inverseMatch.attributeName,
        nullable: inverseMatch.nullable,
        sourceTable: table,
        targetModel: inverseMatch.model,
      });
      compileWhereForModel({
        model: inverseMatch.model,
        models,
        table: inverseMatch.model.drizzleSchema,
        where: value as Record<string, unknown>,
        context,
      });
      continue;
    }

    if (!(key in propertiesShape)) {
      throw new Error(
        `makeSelection: unknown where key "${key}" on model "${model.modelName}"`,
      );
    }

    const column = tableColumns[key];
    if (column === undefined) {
      throw new Error(
        `makeSelection: missing column "${key}" on model "${model.modelName}"`,
      );
    }

    const predicate = compileScalarFilter({ column, value });
    if (predicate !== undefined) {
      context.predicates.push(predicate);
    }
  }
}

function buildSelectFields(props: { model: IModel }): Record<string, unknown> {
  const { model } = props;
  return asTableColumns(model.drizzleSchema);
}

export function makeSelection<
  MODEL extends IModel,
  WHERE extends (props: ISelectionWhereProps) => Record<string, unknown>,
>(props: { model: MODEL; where: WHERE }): ISelection<MODEL, WHERE>;
export function makeSelection<MODEL extends IModel>(props: {
  model: MODEL;
  where?: ISelectionWhereFn<MODEL>;
}): ISelection<MODEL>;
export function makeSelection<MODEL extends IModel>(props: {
  model: MODEL;
  where?: (props: ISelectionWhereProps) => Record<string, unknown>;
}) {
  const { model, where = () => ({}) } = props;
  return {
    model,
    where,
  };
}

export function applySelection<MODEL extends IModel>(props: {
  db: ISelectionDb;
  models: IModels;
  selection: ISelection<MODEL>;
  actorId: IActorId;
  extraPredicates?: readonly SQL[];
}): IFlatSelectBuilder {
  const { db, models, selection, actorId, extraPredicates = [] } = props;

  const rootModel = selection.model;
  const rootTable = rootModel.drizzleSchema;
  const selectFields = buildSelectFields({
    model: rootModel,
  });

  const context: ICompileWhereContext = {
    joins: [],
    predicates: [],
  };

  compileWhereForModel({
    model: rootModel,
    models,
    table: rootTable,
    where: selection.where({ actorId }) as Record<string, unknown>,
    context,
  });

  let query = db.selectDistinct(selectFields).from(rootTable);

  const appliedJoins = new Set<string>();

  for (const join of context.joins) {
    const joinKey = `${String((join.sourceTable as { name: string }).name)}:${join.sourceColumnName}:${join.targetModel.modelName}:${join.targetColumnName}`;
    if (appliedJoins.has(joinKey)) {
      continue;
    }
    appliedJoins.add(joinKey);

    const sourceColumns = asTableColumns(join.sourceTable);
    const targetTable = join.targetModel.drizzleSchema;
    const targetColumns = asTableColumns(targetTable);
    const fromColumn = sourceColumns[join.sourceColumnName];
    const toColumn = targetColumns[join.targetColumnName];
    const condition = eq(asSqlColumn(fromColumn), asSqlColumn(toColumn));

    query =
      join.nullable === true
        ? query.leftJoin(targetTable, condition)
        : query.innerJoin(targetTable, condition);
  }

  if (context.predicates.length > 0 || extraPredicates.length > 0) {
    const allPredicates = [...context.predicates, ...extraPredicates];
    query = query.where(
      allPredicates.length === 1 ? allPredicates[0] : and(...allPredicates),
    );
  }

  return query;
}

export function selectAllFromSelection<MODEL extends IModel>(props: {
  db: ISelectionDb;
  models: IModels;
  selection: ISelection<MODEL>;
  actorId: IActorId;
}): IFlatSelectBuilder {
  const { db, models, selection, actorId } = props;
  return applySelection({
    db,
    models,
    selection: {
      model: selection.model,
      where: selection.where,
    },
    actorId,
  });
}
