import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { mapParseError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

export const getSystemSpec = Effect.fn('SystemWorker.getSystemSpec', {
  root: true,
})(function* (): Effect.fn.Return<ISystemSpec, IAnyError> {
  const specUnknown = makeSystemSpec({ system });
  return yield* Schema.decodeUnknown(SystemSpecSchema)(specUnknown).pipe(
    mapParseError({
      code: 'system-runtime-system-spec-invalid',
      prefix: 'The static System returned an invalid SystemSpec',
    }),
  );
});
