import { it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { expect } from 'vitest';

import { defineContract } from './defineContract.ts';
import { encodePayload } from './encodePayload.ts';
import { makeContractVersion } from './make/makeContractVersion.ts';
import { validatePayload } from './validatePayload.ts';

it.effect(
  'admits JSON null without making its payload descriptor nullable',
  () =>
    Effect.gen(function* () {
      const contract = makeContractVersion(defineContract('setJsonValues'), {
        version: '1.0.0',
        models: {},
        payload: {
          unknownValue: primitives.json({ schema: Schema.Unknown }),
          nullOrObject: primitives.json({
            schema: Schema.NullOr(Schema.Struct({ title: Schema.String })),
          }),
          nullableObject: primitives.json({
            schema: Schema.Struct({ title: Schema.String }),
            nullable: true,
          }),
          stringValue: primitives.json({ schema: Schema.String }),
        },
      });
      const payload = {
        unknownValue: null,
        nullOrObject: null,
        nullableObject: null,
        stringValue: 'null',
      };
      const decoded = yield* validatePayload(contract, {
        version: '1.0.0',
        payload,
      });
      expect(decoded).toEqual(payload);
      const encoded = yield* encodePayload(contract, {
        version: '1.0.0',
        payload: decoded,
      });
      expect(JSON.parse(encoded)).toEqual({
        unknownValue: 'null',
        nullOrObject: 'null',
        nullableObject: null,
        stringValue: '"null"',
      });
    }),
);
