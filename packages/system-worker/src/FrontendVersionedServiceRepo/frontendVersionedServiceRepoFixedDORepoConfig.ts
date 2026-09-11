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

import { frontendVersionedServiceRepoTables } from './frontendVersionedServiceRepoDbConfig.js';

const { system } = config;

/** Name and fixed-schema metadata stay independent of the class and its VSC/FSC RPC dependencies. */
/*
 * FrontendVersionedServiceRepo activation resolves its resource schema from the
 * physical Repo key. Name metadata stays independent of the Repo class so
 * upstream lookups can share the contract without loading its RPC dependencies.
 *
 * 1. Resolve the bound service.
 * 2. Select the bound service snapshot.
 * 3. Build version-owned replica storage.
 */
export const frontendVersionedServiceRepoFixedDORepoConfig =
  makeFixedDORepoConfig({
    abbreviation: systemWorkerAbbreviations.frontendVersionedServiceRepo,
    repoType: 'FrontendVersionedServiceRepo',
    namePattern: RoutePattern.parse(
      '/:systemId/:serviceName/:serviceVersion/:selectionPath/:frontendName',
    ),
    managedRuntime,
    dbConfig: Effect.fn('FrontendVersionedServiceRepo.dbConfig')(function* ({
      key,
    }) {
      // 1 — read system.services by key.serviceName
      const service = yield* getByKeyOrThrow({
        record: system.services,
        key: key.serviceName,
        recordKind: 'services',
      });

      // 2 — require authored support for key.serviceVersion
      const version = yield* getByKeyOrThrow({
        record: service,
        key: key.serviceVersion,
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

      // 3 — supply the exact selected service model registry
      return makeResourceDbConfig({
        otherTables: frontendVersionedServiceRepoTables,
        models: version.models,
      });
    }),
  });
