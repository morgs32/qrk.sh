import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { ServiceChain } from '../../ServiceChain/ServiceChain.js';

import type { onMessage } from './onMessage.js';

/** Authenticate a browser command against the retained socket capability before admission. */
export const pushServiceCommand = Effect.fn('ServiceSession.pushCommand')(
  function* (props: Parameters<typeof onMessage>[0] & { input: unknown }) {
    const state = props.connection.state;
    const command = yield* Schema.decodeUnknownEffect(
      EncodedServiceCommandSchema,
    )(props.input, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'service-command-invalid',
        prefix: 'Invalid service command',
      }),
    );
    const result = yield* Effect.gen(function* () {
      const caller = command.caller;
      if (
        state?.phase !== 'live' ||
        caller === null ||
        caller.nodeId === null ||
        caller.nodeId !== state.nodeId ||
        caller.actorName !== props.key.actorName ||
        caller.actorVersion !== props.key.actorVersion ||
        caller.sessionName !== state.sessionName ||
        !isEqual(caller.claims, state.claims) ||
        command.serviceName !== props.key.serviceName ||
        command.serviceVersion !== props.key.serviceVersion ||
        state.serviceSessionLock.contracts[command.commandName]?.version !==
          command.contractVersion
      ) {
        return yield* makeZerospinError('service-command-capability-mismatch');
      }
      const chain = yield* ServiceChain.getRepo({ key: props.key });
      const receipt = yield* makeAsync<
        Awaited<ReturnType<ServiceChain['admitServiceCommand']>>
      >(() => chain.admitServiceCommand({ command })).pipe(
        Effect.flatMap(readRpcEnvelope),
      );
      return {
        id: command.id,
        nodeIndex: caller.nodeIndex,
        admissionIndex: receipt.serviceIndex,
        admission: receipt.admission,
      };
    }).pipe(encodeRpcOutcome);
    props.connection.send(
      JSON.stringify(
        result._tag === 'Success'
          ? { type: 'serviceCommandAdmission', ...result.success }
          : {
              type: 'serviceCommandAdmissionFailed',
              id: command.id,
              failure: result.failure,
            },
      ),
    );
  },
);
