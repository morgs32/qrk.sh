import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IDb } from '../drizzle/types.ts';
import { runProgram } from '../execution/runProgram.ts';
import type { IAnyService } from '../service/types.ts';

import { validateFailure } from './failureCodec.ts';
import type { IContract, IServiceCommand } from './types.ts';

/** Recheck the retained actor's permission and business guard at authoritative execution. */
export const validateServiceCommand = Effect.fn('validateServiceCommand')(
  function* (props: {
    service: IAnyService;
    caller: IServiceCommand['caller'];
    contract: IContract;
    db: Readonly<Pick<IDb, 'query'>>;
    payload: unknown;
    response?: unknown;
  }) {
    if (props.caller === null) return;
    const actor = props.service.actors[props.caller.actorName];
    if (
      (props.contract.external === undefined &&
        actor?.version !== props.caller.actorVersion) ||
      actor?.contracts[props.contract.commandName] !== props.contract
    ) {
      return yield* makeZerospinError('service-command-actor-forbidden');
    }
    const claims = yield* Schema.decodeUnknownEffect(
      actor!.identity.claimsSchema,
    )(props.caller.claims, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'service-command-claims-invalid',
        prefix: 'Invalid retained caller',
      }),
    );
    yield* runProgram(
      Effect.suspend(
        () =>
          actor!.guards[props.contract.commandName]?.({
            db: props.db,
            payload: props.payload,
            ...(props.contract.external === undefined
              ? {}
              : { response: props.response }),
            claims,
            failures: props.contract.failures,
          }) ?? Effect.void,
      ),
    ).pipe(
      Effect.catch(failure =>
        isZerospinError(failure) && !('scope' in failure)
          ? Effect.fail(failure)
          : validateFailure(props.contract, failure, 'actor').pipe(
              Effect.flatMap(Effect.fail),
            ),
      ),
    );
  },
);
