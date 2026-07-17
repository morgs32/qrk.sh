import { assert, Equals } from 'tsafe';

/**
 * Use Equals for exact parity — not extends ternary assignability checks.
 *
 * @bad assert<InferRow<typeof shape> extends IExpectedRow ? true : false>().
 */
assert<
  Equals<
    InferRow<typeof commandRowShape>,
    {
      readonly id: InferIdFromAbbreviation<'cmd'>;
      readonly payload: string;
      readonly status: 'executed';
    }
  >
>();

declare type InferRow<T> = unknown;
declare const commandRowShape: unknown;
declare type InferIdFromAbbreviation<A extends string> = `${A}_${string}`;
