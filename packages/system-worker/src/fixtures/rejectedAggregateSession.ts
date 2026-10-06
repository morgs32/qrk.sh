import assert from 'node:assert/strict';

import { encodeError, ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import { AggregateSessionApiFailure } from '../AggregateSessionApi/AggregateSessionApiFailure/AggregateSessionApiFailure.js';

const admissionError = new ZerospinError({
  code: 'fixture-actor-forbidden',
  message: 'The actor is not allowed to open this aggregate session.',
  status: 403,
});
const encodedError = await Effect.runPromise(encodeError(admissionError));
for (const error of [admissionError, encodedError]) {
  const rejected = new AggregateSessionApiFailure(error);
  const response = await rejected.validateActorCommand({
    traceContext: null,
    args: [{ contractName: 'unavailable', payload: { arbitrary: 'input' } }],
  });
  assert.deepEqual(response, {
    result: { _tag: 'Failure', failure: encodedError },
    link: null,
  });
}
console.log(
  'Rejected aggregate sessions retain admission errors during command validation.',
);
