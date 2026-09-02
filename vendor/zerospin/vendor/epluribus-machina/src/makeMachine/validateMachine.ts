import { Schema } from 'effect';

import type { IMachine } from '../types.js';

import { decodeMachineData } from './decodeMachineData.js';
import { CanonicalMachineSchema } from './Machine.js';

export const validateMachine: (
  input: unknown,
) => asserts input is IMachine<any, any, any> = input => {
  Schema.decodeUnknownSync(CanonicalMachineSchema)(input);
  decodeMachineData(input, true);
};
