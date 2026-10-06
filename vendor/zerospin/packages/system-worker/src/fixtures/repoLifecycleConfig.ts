import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';

const aggregate = makeAggregateVersion(
  { name: 'lifecycle' },
  { version: '1.0.0', models: {}, contracts: {}, actors: {} },
);
const secondaryAggregate = makeAggregateVersion(
  { name: 'secondary' },
  { version: '1.0.0', models: {}, contracts: {}, actors: {} },
);

export const system = makeSystem({
  name: 'lifecycle',
  aggregates: {
    lifecycle: { '1.0.0': aggregate },
    secondary: { '1.0.0': secondaryAggregate },
  },
});

// oxlint-disable-next-line import/no-default-export -- Full authored config for the disposable fixed-repo Worker.
export default { system };
