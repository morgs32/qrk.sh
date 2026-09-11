import type { InferEncodedRow } from '@zerospin/schema';
import { assert, type Equals } from 'tsafe';

import type { IEncodedCommand, ISessionCommand } from '../contracts/types.ts';
import type { Prettify } from '../models/types.ts';

import { type sessionCommandJournalShape } from './sessionCommandShape.ts';

assert<
  Equals<
    InferEncodedRow<typeof sessionCommandJournalShape>,
    Prettify<
      {
        -readonly [KEY in Exclude<
          keyof IEncodedCommand<ISessionCommand>,
          'authentication'
        >]: IEncodedCommand<ISessionCommand>[KEY];
      } & {
        authentication: string;
        sessionIndex: number | null;
        command: string;
      }
    >
  >
>();
