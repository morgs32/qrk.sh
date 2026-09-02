import { Context } from 'effect';

import type { IPosthog } from '../utils/types.ts';

export class PosthogService extends Context.Service<PosthogService, IPosthog>()(
  'PosthogService',
) {}
