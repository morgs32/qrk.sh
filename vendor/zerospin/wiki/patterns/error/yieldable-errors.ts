import { Effect, type Cause } from 'effect';

/**
 * Yield a locally constructed business error or API Effect directly when the
 * value has no other use. Serialize runtime errors at result/API boundaries;
 * received JSON failures are data, not yieldable Error instances.
 *
 * ContractError belongs to contract guards/programs on session or AAVR snapshot
 * data; programs construct mutations without database access. ActorError belongs to actor
 * guards on the whole AAVR replica. AggregateError belongs to aggregate guards
 * inside the authoritative AVR mutation transaction, never predictive checks.
 *
 * Declare every guard as a named Effect.fn, including callbacks that only
 * delegate to shared checks. Give shared guard functions their own Effect.fn
 * names as well.
 * Use makeGuard({ models, payload, identity, program }) for reusable
 * database checks. Payload and identity are Effect schemas; program is a
 * named Effect.fn with inferred { db, payload, identity }. Invocation
 * accepts decoded inputs without decoding again. Each owner callback supplies
 * its db as db and retains responsibility for the allowed failure scope.
 *
 * Use direct callbacks: contract.guard, actor.guards[commandName], and
 * aggregate.guards[actorName][commandName]. Ownership determines scope; do not
 * add descriptor arrays or replace inherited checks. Infer business JSON types
 * from their codecs instead of adding a separate scoped-JSON alias.
 *
 * This is the agreed spec 005 target; its runtime migration is not implemented.
 * The declarations below model the intended interfaces.
 *
 * @bad Bind an error or API Effect to a temporary used only by the next yield.
 * @bad Wrap a yieldable error in Effect.fail solely to yield it in a generator.
 * @bad Yield a received JSON error directly or assume its prototype survived RPC.
 */
export const checkOwner = Effect.fn('checkOwner')(function* (
  accountId: string,
) {
  yield* AccountNotOwned.make({ extra: { accountId } });
});

export const withdraw = Effect.fn(function* (
  accountId: string,
  amount: number,
) {
  yield* api.withdraw({ accountId, amount });
});

declare const AccountNotOwned: {
  make(props: { extra: { accountId: string } }): Cause.YieldableError & {
    readonly code: 'account-not-owned';
    readonly scope: 'contract';
    readonly extra: { accountId: string };
  };
};

declare const api: {
  withdraw(props: { accountId: string; amount: number }): Effect.Effect<
    void,
    Readonly<{
      _tag: 'ZerospinError';
      code: string;
      message: string;
      status: number | null;
      extra: null;
    }>
  >;
};
