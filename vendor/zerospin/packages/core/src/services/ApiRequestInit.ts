import { Context } from 'effect';

import type { IApiRequestInit } from '../utils/types.ts';

export class ApiRequestInit extends Context.Tag('ApiRequestInit')<
  ApiRequestInit,
  IApiRequestInit
>() {}
