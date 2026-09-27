import { is, Param, Placeholder, type Query } from 'drizzle-orm';
import { SQLiteDialect } from 'drizzle-orm/sqlite-core/dialect';
import {
  RelationalQueryBuilder,
  SQLiteRelationalQuery,
  type SQLiteRelationalQueryHKTBase,
} from 'drizzle-orm/sqlite-core/query-builders/query';
import { SQLiteSession } from 'drizzle-orm/sqlite-core/session';
import { Schema } from 'effect';

import { makeResourceDbConfig } from '../../drizzle/make/makeDbConfig/makeDbConfig.ts';
import type { IDb, IDbConfig, IResourceDbConfig } from '../../drizzle/types.ts';
import type { IIdentitySchema } from '../../identity/types.ts';
import type { ISelectionQuery } from '../SelectionQuerySchema.ts';
import type { IAnyModels, IModel } from '../types.ts';

class AuthoringSession extends SQLiteSession {
  prepareQuery(): never {
    throw new Error('Actor database definitions cannot execute queries');
  }
}
export interface IActorQueryHKT extends SQLiteRelationalQueryHKTBase {
  _type: ActorQuery<this['result']>;
}

/** Drizzle query construction is connection-free; only this adapter touches its compiler internals. */
export class ActorQuery<TResult = unknown> extends SQLiteRelationalQuery<
  IActorQueryHKT,
  TResult
> {
  private readonly queryMode: string;
  private readonly rootTable: ConstructorParameters<
    typeof SQLiteRelationalQuery
  >[2];
  constructor(...args: ConstructorParameters<typeof SQLiteRelationalQuery>) {
    super(...args);
    this.queryMode = args[7];
    this.rootTable = args[2];
  }

  capture(props: {
    db: IAnyActorDbVersion;
    model: IModel;
    key: string;
    identity: IIdentitySchema;
  }) {
    if (
      this.schema !== props.db.config.relations ||
      this.rootTable !== props.db.config.relations[props.key]?.table
    ) {
      throw new Error(
        `Selection ${props.key} must query its actor database model`,
      );
    }
    if (
      this.queryMode !== 'many' ||
      (this.config !== true &&
        (this.config.columns !== undefined ||
          this.config.with !== undefined ||
          this.config.extras !== undefined))
    ) {
      throw new Error(
        'Selections must use findMany and return complete model rows without columns, with, or extras',
      );
    }
    const { query, builtQuery } = this._toSQL();
    const bindings = builtQuery.params.map(
      (parameter): ISelectionQuery['bindings'][number] => {
        const placeholder = is(parameter, Placeholder)
          ? parameter
          : is(parameter, Param) && is(parameter.value, Placeholder)
            ? parameter.value
            : undefined;
        if (placeholder !== undefined) {
          if (!Object.hasOwn(props.identity.fields, placeholder.name)) {
            throw new Error(
              `Selection parameter ${placeholder.name} is not an actorPath field`,
            );
          }
          return { type: 'identity', name: placeholder.name };
        }
        if (
          parameter === null ||
          typeof parameter === 'string' ||
          (typeof parameter === 'number' && Number.isFinite(parameter))
        ) {
          return { type: 'literal', value: parameter };
        }
        if (parameter instanceof Uint8Array) {
          return { type: 'bytes', value: [...parameter] };
        }
        if (typeof parameter === 'bigint') {
          return { type: 'bigint', value: String(parameter) };
        }
        throw new Error('Unsupported selection SQL parameter');
      },
    );
    const compiled: Query = {
      ...builtQuery,
      params: builtQuery.params.map(value => {
        if (is(value, Placeholder)) {
          return Object.freeze(new Placeholder(value.name));
        }
        if (is(value, Param) && is(value.value, Placeholder)) {
          return Object.freeze(
            new Param(
              Object.freeze(new Placeholder(value.value.name)),
              value.encoder,
              value.codec,
            ),
          );
        }
        return value instanceof Uint8Array ? new Uint8Array(value) : value;
      }),
    };
    const mapper = this.dialect.mapperGenerators.relationalRows({
      isFirst: false,
      parseJson: true,
      parseJsonIfString: false,
      rootJsonMappers: false,
      selection: query.selection,
      arrayModeRoot: true,
    });
    const definition: ISelectionQuery = { sql: compiled.sql, bindings };
    for (const binding of bindings) {
      if (binding.type === 'bytes') Object.freeze(binding.value);
      Object.freeze(binding);
    }
    Object.freeze(bindings);
    Object.freeze(definition);
    return Object.freeze({
      model: props.model,
      models: props.db.models,
      query: definition,
      all(db: Pick<IDb, '_'>, identity: Readonly<Record<string, string>>) {
        for (const binding of bindings) {
          if (
            binding.type === 'identity' &&
            typeof identity[binding.name] !== 'string'
          ) {
            throw new Error(`Missing selection parameter ${binding.name}`);
          }
        }
        return db._.session
          .prepareQuery(compiled, 'arrays', false, 'all', mapper)
          .all({ ...identity });
      },
    });
  }
}

export type IAnyActorDbVersion = Readonly<{
  models: IAnyModels;
  config: IDbConfig;
  query: Readonly<Record<string, unknown>>;
}>;

export type IActorDbVersion<M extends IAnyModels = IAnyModels> = Readonly<{
  models: M;
  config: IResourceDbConfig<M, Record<never, never>>;
  query: {
    [K in keyof IResourceDbConfig<
      M,
      Record<never, never>
    >['relations']]: RelationalQueryBuilder<
      'sync',
      IResourceDbConfig<M, Record<never, never>>['relations'],
      IResourceDbConfig<M, Record<never, never>>['relations'][K],
      IActorQueryHKT
    >;
  };
}>;

export const ActorDbSchema = Schema.declare(
  (value: unknown): value is IAnyActorDbVersion =>
    typeof value === 'object' && value !== null && actorDbs.has(value),
);
const actorDbs = new WeakSet<object>();

export function makeActorDbVersion<const M extends IAnyModels>(props: {
  models: M;
}): IActorDbVersion<M>;
export function makeActorDbVersion(props: { models: IAnyModels }): unknown {
  const models = Object.freeze({ ...props.models });
  const config = makeResourceDbConfig({ models });
  const dialect = new SQLiteDialect();
  const session = new AuthoringSession(dialect);
  const query = Object.fromEntries(
    Object.entries(config.relations).map(([key, relation]) => [
      key,
      new RelationalQueryBuilder(
        'sync',
        config.relations,
        relation.table,
        relation,
        dialect,
        session,
        true,
        ActorQuery,
      ),
    ]),
  );
  const db = Object.freeze({ models, config, query: Object.freeze(query) });
  actorDbs.add(db);
  return db;
}

export type IActorQueries = Readonly<Record<string, ActorQuery>>;
export type IActorSelections<
  MODELS extends IAnyModels,
  QUERIES extends IActorQueries,
  IDENTITY = Readonly<Record<string, string>>,
> = {
  readonly [K in keyof QUERIES]: ISelection<
    K extends keyof MODELS ? MODELS[K] : IModel,
    IDENTITY
  >;
};
export type ISelection<
  MODELS extends IModel = IModel,
  IDENTITY = Readonly<Record<string, string>>,
> = {
  readonly model: MODELS;
  readonly models: IAnyModels;
  readonly query: ISelectionQuery;
  all(db: Pick<IDb, '_'>, identity: IDENTITY): unknown;
};
export type ValidActorQueries<
  MODELS extends IAnyModels,
  QUERIES extends IActorQueries,
> = {
  [K in keyof QUERIES]: K extends keyof MODELS
    ? QUERIES[K]['_']['result'] extends {
        [C in keyof MODELS[K]['table']['shape']]: unknown;
      }[]
      ? Exclude<
          keyof QUERIES[K]['_']['result'][number],
          keyof MODELS[K]['table']['shape']
        > extends never
        ? unknown
        : never
      : never
    : never;
};

export function captureActorSelections<
  DB extends IAnyActorDbVersion,
  QUERIES extends IActorQueries,
  S extends IIdentitySchema,
>(
  db: DB,
  queries: QUERIES,
  identity: S,
): IActorSelections<DB['models'], QUERIES, S['Type']>;
export function captureActorSelections(
  db: IAnyActorDbVersion,
  queries: IActorQueries,
  identity: IIdentitySchema,
): Record<string, ISelection> {
  return Object.fromEntries(
    Object.entries(queries).map(([key, query]) => {
      const model = db.models[key];
      if (model === undefined || !(query instanceof ActorQuery)) {
        throw new Error(`Invalid actor selection ${key}`);
      }
      return [key, query.capture({ db, model, key, identity })];
    }),
  );
}
