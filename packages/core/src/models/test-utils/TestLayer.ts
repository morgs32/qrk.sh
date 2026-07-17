import { Effect, Layer, Logger, LogLevel } from 'effect';

import { CuidFactory } from '../../services/CuidFactory.ts';

export const testTraceLoggerLayer = Logger.minimumLogLevel(LogLevel.Trace);
export const TraceLoggerLayer = testTraceLoggerLayer;

type LetterLower =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z';

type LetterUpper = Uppercase<LetterLower>;

type IdPrefix = `${LetterLower | LetterUpper}${string}`;

export function makePrefixedIncrementalIdFactory(idPrefix: IdPrefix) {
  return Layer.effect(
    CuidFactory,
    Effect.sync(() => {
      let count = 0;
      return CuidFactory.of(() => Effect.succeed(`${idPrefix}-${count++}`));
    }),
  );
}
