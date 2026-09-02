import { Schema } from 'effect';

import type { InferStateName, InferStateValue, State } from '../types.js';
import { makeState } from './makeState.js';

type IEqual<LEFT, RIGHT> =
  (<TYPE>() => TYPE extends LEFT ? 1 : 2) extends <TYPE>() =>
    TYPE extends RIGHT ? 1 : 2
    ? true
    : false;
type IExpect<VALUE extends true> = VALUE;

const IdleInput = { draft: Schema.String };

const Idle = makeState({
  stateName: 'idle',
  input: IdleInput
});

type _Idle = IExpect<
  IEqual<typeof Idle, State<'idle', typeof IdleInput>>
>;

type _IdleValue = IExpect<
  IEqual<
    InferStateValue<typeof Idle>,
    { readonly stateName: 'idle'; readonly draft: string }
  >
>;

type _IdleStateName = IExpect<IEqual<InferStateName<typeof Idle>, 'idle'>>;

// @ts-expect-error State declaration fields are readonly.
Idle.stateName = 'renamed';

makeState({
  // @ts-expect-error `__proto__` is reserved as a State name.
  stateName: '__proto__',
  input: {}
});

makeState({
  stateName: 'named',
  // @ts-expect-error State input reserves generated `stateName`.
  input: { stateName: Schema.Literal('named') }
});

makeState({
  stateName: 'behavioral',
  // @ts-expect-error State Handle behavior reserves `commands`.
  input: { commands: Schema.Struct({}) }
});
