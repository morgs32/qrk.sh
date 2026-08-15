import { Effect } from 'effect';
import { Schema } from 'effect/Schema';

/**
 * Trust-boundary validation lives in *Api — not SystemWorker or *Repo DOs.
 *
 * @bad Validate the same wire props again in SystemWorker after
 * AuthenticatedApi.getAggregateFrontendApi decoded them.
 * @bad Run `Schema.decodeUnknown` on an aggregate frontend lock inside a repo
 * DO when the AuthenticatedApi capability factory already validated it.
 */
export const getAggregateFrontendApi = Effect.fn(
  'AuthenticatedApi.getAggregateFrontendApi',
)(function* (props: unknown) {
  const validated = yield* Schema.validate(AggregateFrontendApiPropsSchema)(
    props,
    { onExcessProperty: 'error' },
  ).pipe(mapParseError({ code: 'aggregate-frontend-api-props-invalid' }));

  return aggregateFrontendApiFactory(validated);
});

export class SystemWorker {
  authorizeAggregateFrontend(props: {
    aggregateId: string;
    aggregateName: string;
    frontendName: string;
    aggregateFrontendLock: unknown;
    userId: string;
  }) {
    return authorizeAggregateFrontend(props);
  }
}

declare const AggregateFrontendApiPropsSchema: unknown;
declare function mapParseError(props: {
  code: string;
}): (effect: unknown) => unknown;
declare function aggregateFrontendApiFactory(props: unknown): unknown;
declare function authorizeAggregateFrontend(props: unknown): Promise<{
  actorRef: {
    aggregateId: string;
    aggregateName: string;
    userId: string;
  };
}>;
