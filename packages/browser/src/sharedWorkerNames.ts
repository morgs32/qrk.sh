import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import { makeZerospinError } from '@zerospin/error';

import { sharedWorkerVersion } from './sharedWorkerVersion.ts';
export const aggregateSharedWorkerPattern = RoutePattern.parse(
  '/zerospin/aggregate/:sharedWorkerVersion/:sessionKey',
);
export const serviceSharedWorkerPattern = RoutePattern.parse(
  '/zerospin/service/:sharedWorkerVersion/:sessionKey',
);
const aggregateMatcher = createMatcher(aggregateSharedWorkerPattern);
const serviceMatcher = createMatcher(serviceSharedWorkerPattern);
export const makeAggregateSharedWorkerName = (sessionKey: string) =>
  createHref(aggregateSharedWorkerPattern, { sharedWorkerVersion, sessionKey });
export const makeServiceSharedWorkerName = (sessionKey: string) =>
  createHref(serviceSharedWorkerPattern, { sharedWorkerVersion, sessionKey });
export function parseSharedWorkerName(name: string) {
  const url = new URL('http://worker.invalid' + name);
  const aggregate = aggregateMatcher.match(url);
  const service = serviceMatcher.match(url);
  const match = aggregate ?? service;
  if (
    match === null ||
    match === undefined ||
    match.params.sharedWorkerVersion !== sharedWorkerVersion ||
    !/^[a-f0-9]{64}$/u.test(match.params.sessionKey) ||
    url.pathname !== name ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw makeZerospinError({ code: 'node-worker-name-invalid' });
  }
  return {
    kind: aggregate ? ('aggregate' as const) : ('service' as const),
    sessionKey: match.params.sessionKey,
  };
}
