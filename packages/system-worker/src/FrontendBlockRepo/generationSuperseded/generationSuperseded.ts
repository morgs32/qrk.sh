import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

export const generationSuperseded = Effect.fn(
  'FrontendBlockRepo.generationSuperseded',
)(function* (props: {
  successorGenerationId: string;
  key: { generationId: string };
  close: (code: number, reason: string) => void;
}): Effect.fn.Return<void, IAnyError> {
  const successorGenerationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(props.successorGenerationId).pipe(
    mapParseError({
      code: 'frontend-successor-generation-invalid',
      prefix: 'Failed to decode FrontendBlockRepo successor generationId',
    }),
  );
  if (successorGenerationId === props.key.generationId) {
    return yield* new ZerospinError({
      code: 'frontend-successor-generation-self-reference',
      message:
        'FrontendBlockRepo successor generation must differ from its generation',
    });
  }
  props.close(4001, 'generation-superseded');
});
