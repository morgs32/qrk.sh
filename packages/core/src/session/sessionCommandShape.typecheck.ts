import { assert, type Equals } from 'tsafe';

import type {
  IEncodedCommand,
  IExecutedPushedCommand,
  IPushedCommand,
  IStagedSessionCommand,
} from '../contracts/types.ts';
import type { InferEncodedRow, Prettify } from '../models/types.ts';

import {
  type sessionExecutedPushedCommandShape,
  type sessionFailedCommandShape,
  type sessionPushedCommandShape,
  type sessionStagedCommandShape,
} from './sessionCommandShape.ts';

assert<
  Equals<
    InferEncodedRow<typeof sessionStagedCommandShape>,
    Prettify<
      IEncodedCommand<IStagedSessionCommand> &
        Readonly<{ replicaIndex: number | null }>
    >
  >
>();
assert<
  Equals<
    InferEncodedRow<typeof sessionPushedCommandShape>,
    IEncodedCommand<IPushedCommand>
  >
>();
assert<
  Equals<
    InferEncodedRow<typeof sessionExecutedPushedCommandShape>,
    IEncodedCommand<IExecutedPushedCommand>
  >
>();
assert<
  Equals<
    InferEncodedRow<typeof sessionFailedCommandShape>['replicaIndex'],
    number | null
  >
>();
