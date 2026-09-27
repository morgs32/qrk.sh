import { assert, Equals } from 'tsafe';

/**
 * Use Equals for exact parity — not extends ternary assignability checks.
 *
 * @bad assert<InferRow<typeof shape> extends IExpectedRow ? true : false>().
 */
assert<
  Equals<
    InferRow<typeof aggregateCommandRowShape>,
    {
      readonly aggregateIndex: number;
      readonly commandId: InferIdFromAbbreviation<'cmd'>;
      readonly result: string | null;
    }
  >
>();

declare type InferRow<T> = unknown;
declare const aggregateCommandRowShape: unknown;
declare type InferIdFromAbbreviation<A extends string> = `${A}_${string}`;
