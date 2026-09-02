import { Schema } from 'effect';

import type { IStateMap } from '../types.js';
import { CanonicalStateSchema } from './State.js';

const StrictParseOptions = { onExcessProperty: 'error' } as const;

const allowedStateOwnKeys = new Set<PropertyKey>([
  'stateName',
  'input',
  'schema',
]);

const isStateInputFields = (
  value: unknown,
): value is Schema.Struct.Fields => {
  if (typeof value !== 'object' || value === null || Schema.isSchema(value)) {
    return false;
  }
  return Reflect.ownKeys(value).every(
    key =>
      typeof key === 'string' &&
      Schema.isSchema(Reflect.get(value, key)),
  );
};

const StringPropertyKeys = Schema.makeFilter<object>(value =>
  Reflect.ownKeys(value).every(key => typeof key === 'string')
    ? undefined
    : 'Expected only string keys',
);

const StateMapSchema = Schema.Record(
  Schema.PropertyKey,
  CanonicalStateSchema,
).check(Schema.isMinProperties(1), StringPropertyKeys);

export const decodeStateMap = (input: unknown): IStateMap => {
  const states = Schema.decodeUnknownSync(
    StateMapSchema,
    StrictParseOptions,
  )(input);

  for (const [key, state] of Object.entries(states)) {
    if (!Schema.is(CanonicalStateSchema)(state)) {
      Schema.decodeUnknownSync(Schema.Never)(state);
    }
    for (const ownKey of Reflect.ownKeys(state)) {
      if (!allowedStateOwnKeys.has(ownKey)) {
        Schema.decodeUnknownSync(Schema.Never)(state);
      }
    }
    if (
      typeof state.stateName !== 'string' ||
      !isStateInputFields(state.input) ||
      !Schema.isSchema(state.schema) ||
      typeof state.make !== 'function'
    ) {
      Schema.decodeUnknownSync(Schema.Never)(state);
    }
    Schema.decodeUnknownSync(Schema.Literal(state.stateName))(key);
  }

  // ALLOWED_CAST: StateMapSchema validates non-empty, string-keyed canonical
  // State instances, and the loop strictly validates every key/stateName
  // equality while retaining the original State references.
  return states as IStateMap;
};
