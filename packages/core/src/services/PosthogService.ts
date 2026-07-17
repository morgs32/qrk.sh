import { Context } from 'effect';

import type { IPosthog } from '../utils/types.ts';

export class PosthogService extends Context.Tag('PosthogService')<
  PosthogService,
  IPosthog
>() {}
