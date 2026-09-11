import type { InferResource } from '@zerospin/core/models/types';
import type { IAnyError } from '@zerospin/error';
import { Context, type Effect } from 'effect';

import type { userV1 } from './models/user/UserV1';

/** The guard layer binds this lazy synchronous lookup to the current execution database. */
export class CurrentUser extends Context.Service<
  CurrentUser,
  Effect.Effect<InferResource<typeof userV1>, IAnyError>
>()('shopping/CurrentUser') {}
