import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { mapParseError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

/*
 * Spec acceptance, inspection, and common Repo activation serialize the
 * statically authored System in their executing Worker and validate the spec.
 *
 * 1. Serialize the authored System.
 * 2. Validate the serialized spec.
 */
export const getSystemSpec = Effect.fn('SystemWorker.getSystemSpec', {
  root: true,
})(function* (): Effect.fn.Return<ISystemSpec, IAnyError> {
  // 1 — call makeSystemSpec with the configured system module
  const specUnknown = makeSystemSpec({ system });

  // 2 — decode SystemSpecSchema or return system-runtime-system-spec-invalid
  return yield* Schema.decodeUnknownEffect(SystemSpecSchema)(specUnknown).pipe(
    mapParseError({
      code: 'system-runtime-system-spec-invalid',
      prefix: 'The static System returned an invalid SystemSpec',
    }),
  );
});
