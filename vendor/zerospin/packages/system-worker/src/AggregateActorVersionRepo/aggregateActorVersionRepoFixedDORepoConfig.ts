import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import config from 'config';
import { Effect, Schema } from 'effect';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { aggregateActorVersionRepoDbConfig } from './aggregateActorVersionRepoDbConfig.js';

const { system } = config;

/** Name and fixed-schema metadata stay independent of the class and its VAC/ActorVAC RPC dependencies. */
/*
 * AggregateActorVersionRepo activation resolves its resource schema from the
 * physical Repo key. Name metadata stays independent of the Repo class so
 * upstream lookups can share the contract without loading its RPC dependencies.
 *
 * 1. Resolve the bound aggregate.
 * 2. Select the bound aggregate snapshot.
 * 3. Build version-owned replica storage.
 */
export const aggregateActorVersionRepoFixedDORepoConfig = makeFixedDORepoConfig(
  {
    abbreviation: systemWorkerAbbreviations.aggregateActorVersionRepo,
    repoType: 'AggregateActorVersionRepo',
    namePattern: RoutePattern.parse(
      '/:systemId/:aggregateId/:aggregateName/:aggregateVersion/:actorName/:actorVersion/:actorPath',
    ),
    managedRuntime: config.system.runtime,
    dbConfig: Effect.fn('AggregateActorVersionRepo.dbConfig')(function* ({
      key,
    }) {
      // 1 — read system.aggregates by key.aggregateName
      const aggregate = yield* getByKeyOrThrow({
        record: system.aggregates,
        key: key.aggregateName,
        recordKind: 'aggregates',
      });

      // 2 — require authored support for key.aggregateVersion
      const version = yield* getByKeyOrThrow({
        record: aggregate,
        key: key.aggregateVersion,
        recordKind: 'listed versions',
      });

      const view = yield* resolveAggregateActorVersion(
        { [version.version]: version },
        key,
      );
      const matched = yield* Effect.try({
        try: () =>
          createMatcher(view.identity.pattern).match(
            new URL(key.actorPath, 'https://selection.invalid'),
          ),
        catch: () =>
          makeZerospinError({
            code: 'actor-path-invalid',
            message: 'Invalid replica actor path',
          }),
      });
      const selection = yield* Schema.decodeUnknownEffect(
        view.identity.actorSchema,
      )(matched?.params, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'actor-path-invalid',
          prefix: 'Invalid replica selection fields',
        }),
      );
      const encoded = yield* Schema.encodeEffect(view.identity.actorSchema)(
        selection,
      ).pipe(
        mapParseError({
          code: 'actor-path-invalid',
          prefix: 'Selection fields could not be encoded',
        }),
      );
      const strings = yield* Schema.decodeUnknownEffect(
        Schema.Record(Schema.String, Schema.String),
      )(encoded).pipe(
        mapParseError({
          code: 'actor-path-invalid',
          prefix: 'Encoded selection fields must be strings',
        }),
      );
      if (
        matched === null ||
        createHref(view.identity.pattern, strings) !== key.actorPath
      ) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'actor-path-noncanonical',
            message: 'Replica actor path must be canonical',
          }),
        );
      }

      // 3 — supply the exact selected aggregate model registry
      return makeResourceDbConfig({
        otherTables: aggregateActorVersionRepoDbConfig.tables,
        models: version.models,
      });
    }),
  },
);
