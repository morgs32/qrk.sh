import { Context } from 'effect';

/**
 * Give unique `Context.Service` classes a short identifier matching the class name.
 * Path-prefix only when the class name is reused across modules.
 *
 * @bad Use '@zerospin/core/MonotonicFactory' when the class name is already unique.
 * @bad Reuse the bare identifier 'Store' across modules that each export class Store.
 * @good Prefer 'MonotonicFactory' for a uniquely named service.
 * @good Prefer 'feature/Store' when multiple modules export class Store.
 */
export class MonotonicFactory extends Context.Service<
  MonotonicFactory,
  () => string
>()('MonotonicFactory') {}
