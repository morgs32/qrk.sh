import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { primitives } from '@zerospin/schema';

export const extensionCalls: string[] = [];

export const assignment = makeModelVersion(
  defineModel({ name: 'assignment', abbreviation: 'asn' }),
  {
    version: '1.0.0',
    attributes: { revision: primitives.integer(), approver: primitives.text() },
    indexes: [],
  },
);

export const policy = makeModelVersion(
  defineModel({ name: 'policy', abbreviation: 'pol' }),
  {
    version: '1.0.0',
    attributes: { revision: primitives.integer(), approver: primitives.text() },
    indexes: [],
  },
);
