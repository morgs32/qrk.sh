import { Schema } from 'effect';

import type {
  IAnyAggregate,
  IAnyAuthoredAggregate,
} from '../../../../aggregate/types.ts';
export function resolveSystemAggregate(props: {
  name: string;
  aggregateName: string;
  aggregate: IAnyAuthoredAggregate;
}): IAnyAggregate {
  Schema.decodeUnknownSync(
    Schema.Struct({ name: Schema.Literal(props.aggregateName) }),
    { onExcessProperty: 'ignore' },
  )(props.aggregate);
  return props.aggregate;
}
