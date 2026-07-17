import { Context } from 'effect';

import type { ISignatureFactory } from '../utils/types.ts';

export class SignatureFactory extends Context.Tag('SignatureFactory')<
  SignatureFactory,
  ISignatureFactory
>() {}
