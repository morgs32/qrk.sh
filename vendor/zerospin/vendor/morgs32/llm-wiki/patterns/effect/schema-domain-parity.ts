import { Schema } from 'effect/Schema';

declare function assert<T extends true>(): void;
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/**
 * Define the domain type first, then the schema with `satisfies` and optional `Equals` parity checks.
 *
 * @bad Hand-written row interfaces that drift from the schema shape.
 * @bad Schema and domain type defined independently without assignability checks.
 */
export interface IFoo {
  bar: string;
}

export const FooSchema = Schema.Struct({
  bar: Schema.String,
}) satisfies Schema.Schema<IFoo, unknown>;

const _check1: typeof FooSchema.Type = {} as IFoo;
const _check2: IFoo = {} as typeof FooSchema.Type;
void _check1;
void _check2;

assert<Equals<typeof FooSchema.Type, Readonly<IFoo>>>();
