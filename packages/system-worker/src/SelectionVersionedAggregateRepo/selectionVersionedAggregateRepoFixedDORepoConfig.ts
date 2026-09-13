import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError } from '@zerospin/error';
import config from 'config';
import { Effect, Schema } from 'effect';

import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { selectionVersionedAggregateRepoTables } from './selectionVersionedAggregateRepoDbConfig.js';

const { system } = config;

/** Name and fixed-schema metadata stay independent of the class and its VAC/SelectionVAC RPC dependencies. */
/*
 * SelectionVersionedAggregateRepo activation resolves its resource schema from the
 * physical Repo key. Name metadata stays independent of the Repo class so
 * upstream lookups can share the contract without loading its RPC dependencies.
 *
 * 1. Resolve the bound aggregate.
 * 2. Select the bound aggregate snapshot.
 * 3. Build version-owned replica storage.
 */
export const selectionVersionedAggregateRepoFixedDORepoConfig =
  makeFixedDORepoConfig({
    abbreviation: systemWorkerAbbreviations.selectionVersionedAggregateRepo,
    repoType: 'SelectionVersionedAggregateRepo',
    namePattern: RoutePattern.parse(
      '/:systemId/:aggregateId/:aggregateName/:aggregateVersion/:selectionPath',
    ),
    managedRuntime,
    dbConfig: Effect.fn('SelectionVersionedAggregateRepo.dbConfig')(function* ({
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

      const matched = yield* Effect.try({
        try: () =>
          createMatcher(version.authentication.pattern).match(
            new URL(key.selectionPath, 'https://selection.invalid'),
          ),
        catch: () =>
          new ZerospinError({
            code: 'selection-path-invalid',
            message: 'Invalid replica selection path',
          }),
      });
      const selection = yield* Schema.decodeUnknownEffect(
        version.authentication.selectionSchema,
      )(matched?.params, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'selection-path-invalid',
          prefix: 'Invalid replica selection fields',
        }),
      );
      const encoded = yield* Schema.encodeEffect(
        version.authentication.selectionSchema,
      )(selection).pipe(
        mapParseError({
          code: 'selection-path-invalid',
          prefix: 'Selection fields could not be encoded',
        }),
      );
      const strings = yield* Schema.decodeUnknownEffect(
        Schema.Record(Schema.String, Schema.String),
      )(encoded).pipe(
        mapParseError({
          code: 'selection-path-invalid',
          prefix: 'Encoded selection fields must be strings',
        }),
      );
      if (
        matched === null ||
        createHref(version.authentication.pattern, strings) !==
          key.selectionPath
      ) {
        return yield* new ZerospinError({
          code: 'selection-path-noncanonical',
          message: 'Replica selection path must be canonical',
        });
      }

      // 3 — supply the exact selected aggregate model registry
      return makeResourceDbConfig({
        otherTables: selectionVersionedAggregateRepoTables,
        models: version.models,
      });
    }),
  });
