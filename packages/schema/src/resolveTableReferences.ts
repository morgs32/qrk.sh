import type { IsUnion } from 'type-fest';

import { PrimitiveKind } from './primitiveKind.ts';
import { primitives } from './primitives.ts';
import type {
  IAnyTable,
  IAnyRefDescriptor,
  IAnyTables,
  IIntegerDescriptor,
  INamedRefDescriptor,
  IPrimaryKeyDescriptor,
  IRefDescriptor,
  ITable,
  ITypeError,
} from './types.ts';

type IPrimaryKeyColumn<TABLE extends IAnyTable> = {
  [KEY in keyof TABLE['shape'] & string]: TABLE['shape'][KEY] extends
    | IPrimaryKeyDescriptor
    | (IIntegerDescriptor & { primaryKey: true })
    ? KEY
    : never;
}[keyof TABLE['shape'] & string];

type IResolvedRef<
  REF extends INamedRefDescriptor,
  TABLES extends IAnyTables,
> = REF['table'] extends keyof TABLES
  ? REF['targetColumnName'] extends keyof TABLES[REF['table']]['shape'] & string
    ? IRefDescriptor<
        REF['nullable'],
        TABLES[REF['table']]['shape'][REF['targetColumnName']] extends IPrimaryKeyDescriptor<
          infer ABBREVIATION
        >
          ? ABBREVIATION
          : string,
        TABLES[REF['table']],
        REF['targetColumnName'],
        REF['relation'],
        REF['inverse'],
        REF['unique']
      > &
        (TABLES[REF['table']]['shape'][REF['targetColumnName']] extends IIntegerDescriptor & {
          primaryKey: true;
        }
          ? { targetKind: PrimitiveKind.Integer }
          : unknown)
    : never
  : never;

type INamedRefColumns<TABLE extends IAnyTable> = {
  [KEY in keyof TABLE['shape']]: TABLE['shape'][KEY] extends INamedRefDescriptor
    ? KEY
    : never;
}[keyof TABLE['shape']];

export type IResolvedTables<TABLES extends IAnyTables> = {
  [KEY in keyof TABLES]: [INamedRefColumns<TABLES[KEY]>] extends [never]
    ? TABLES[KEY]
    : ITable<
        TABLES[KEY]['name'],
        {
          [COLUMN in keyof TABLES[KEY]['shape']]: TABLES[KEY]['shape'][COLUMN] extends INamedRefDescriptor
            ? IResolvedRef<TABLES[KEY]['shape'][COLUMN], TABLES>
            : TABLES[KEY]['shape'][COLUMN];
        }
      >;
};

type IReferenceError<
  REF extends INamedRefDescriptor,
  TABLES extends IAnyTables,
> = REF['table'] extends keyof TABLES
  ? REF['targetColumnName'] extends IPrimaryKeyColumn<TABLES[REF['table']]>
    ? IsUnion<IPrimaryKeyColumn<TABLES[REF['table']]>> extends true
      ? `Reference target ${REF['table']} must have only one primary key`
      : never
    : `Reference target ${REF['table']}.${REF['targetColumnName']} must be its primary key`
  : `Unknown reference table ${REF['table']}`;

type IReferenceErrors<TABLES extends IAnyTables> = {
  [KEY in keyof TABLES]: {
    [COLUMN in keyof TABLES[KEY]['shape']]: TABLES[KEY]['shape'][COLUMN] extends INamedRefDescriptor
      ? IReferenceError<TABLES[KEY]['shape'][COLUMN], TABLES>
      : never;
  }[keyof TABLES[KEY]['shape']];
}[keyof TABLES];

export type ICheckedTableReferences<TABLES extends IAnyTables> = [
  IReferenceErrors<TABLES>,
] extends [never]
  ? unknown
  : ITypeError<IReferenceErrors<TABLES>>;

/** Resolve config-local names against the actual owned tables before building codecs or SQL. */
export function resolveTableReferences<TABLES extends IAnyTables>(
  tables: TABLES,
): IResolvedTables<TABLES>;
export function resolveTableReferences(tables: IAnyTables): IAnyTables {
  // Validate every target before changing any descriptor, so failed resolution
  // leaves the input tables available for correction and retry.
  const references: {
    descriptor: IAnyRefDescriptor;
    resolved: IAnyRefDescriptor;
  }[] = [];
  for (const table of Object.values(tables)) {
    for (const descriptor of Object.values(table.shape)) {
      if (
        descriptor.kind !== PrimitiveKind.Ref ||
        typeof descriptor.table !== 'string'
      )
        continue;
      const target = Object.hasOwn(tables, descriptor.table)
        ? tables[descriptor.table]
        : undefined;
      if (target === undefined) {
        throw new Error(
          `Unknown reference table ${descriptor.table} in ${table.name}`,
        );
      }
      const resolved = primitives.ref({
        table: target,
        relation: descriptor.relation,
        inverse: descriptor.inverse,
        nullable: descriptor.nullable,
        unique: descriptor.unique,
      });
      if (resolved.targetColumnName !== descriptor.targetColumnName) {
        throw new Error(
          `Reference target ${descriptor.table}.${descriptor.targetColumnName} must be its primary key (${resolved.targetColumnName})`,
        );
      }
      references.push({ descriptor, resolved });
    }
  }
  for (const { descriptor, resolved } of references) {
    Object.assign(descriptor, resolved);
  }
  return tables;
}
