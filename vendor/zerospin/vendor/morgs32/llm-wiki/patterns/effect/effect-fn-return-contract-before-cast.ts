import { Effect } from 'effect';

declare class DomainError extends Error {}

declare const rowTable: {
  readonly id: string;
};

declare const db: {
  select(): {
    from(table: typeof rowTable): {
      orderBy(column: string): {
        all(): Array<Readonly<{ id: string }>>;
      };
    };
  };
};

/**
 * Put the Effect.fn success/error contract on the generator return type before casting the terminal expression.
 *
 * @bad `return db.select().from(rowTable).all() as Array<Row>` at the end of an Effect.fn.
 * @bad Hiding the Effect.fn result contract behind a one-off local type alias.
 * @bad `as unknown as Array<Row>` instead of making the generator return contract explicit.
 */
export const readRows = Effect.fn('readRows')(function* (): Effect.fn.Return<
  Array<Readonly<{ id: string }>>,
  DomainError
> {
  return db.select().from(rowTable).orderBy(rowTable.id).all();
});
