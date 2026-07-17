import { assert, type Equals } from 'tsafe';

import type {
  IEncodedCommand,
  IExecutedPushedCommand,
  IPushedCommand,
  IStagedCommand,
} from '../contracts/types.ts';
import type { InferEncodedRow } from '../models/types.ts';

import {
  type sessionExecutedPushedCommandShape,
  type sessionPushedCommandShape,
  type sessionStagedCommandShape,
} from './sessionCommandShape.ts';

assert<
  Equals<
    InferEncodedRow<typeof sessionStagedCommandShape>,
    IEncodedCommand<IStagedCommand>
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
