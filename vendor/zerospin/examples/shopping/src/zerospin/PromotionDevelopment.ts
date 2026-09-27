import type { IAnyError } from '@zerospin/error';
import { Context, type Effect } from 'effect';

export class PromotionDevelopment extends Context.Service<
  PromotionDevelopment,
  Effect.Effect<void, IAnyError>
>()('ShoppingPromotionDevelopment') {}
