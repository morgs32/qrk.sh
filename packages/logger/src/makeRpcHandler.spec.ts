import { Context, Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeRpcHandler } from './makeRpcHandler.ts';
import type { ITraceContext } from './types.ts';

describe('makeRpcHandler', () => {
  it('returns an Effect that retains the domain environment', async () => {
    const Multiplier = Context.GenericTag<number>('Multiplier');
    const handle = makeRpcHandler('MockRpc.multiply')(function* (n: number) {
      const multiplier = yield* Multiplier;
      return n * multiplier;
    });

    const envelope = await Effect.runPromise(
      handle({ traceContext: null, args: [7] }).pipe(
        Effect.provideService(Multiplier, 6),
      ),
    );

    expect(envelope.result).toEqual({ _tag: 'Right', right: 42 });
  });

  it('returns Right envelope with a named ok span', async () => {
    const handle = makeRpcHandler('MockRpc.double')(function* (n: number) {
      yield* Effect.logInfo('working');
      return n * 2;
    });
    const envelope = await Effect.runPromise(
      handle({ traceContext: null, args: [21] }),
    );
    expect(envelope.result).toEqual({ _tag: 'Right', right: 42 });
    expect(envelope.telemetry.spans[0]?.name).toBe('MockRpc.double');
    expect(envelope.telemetry.spans[0]?.status).toBe('ok');
    expect(envelope.telemetry.spans[0]?.parentSpanId).toBeNull();
  });

  it('parents under wire-carried trace context', async () => {
    const handle = makeRpcHandler('MockRpc.double')(function* () {
      return 1;
    });
    const context: ITraceContext = {
      traceId: 'trc_parent',
      parentSpanId: 'spn_parent',
    };
    const envelope = await Effect.runPromise(
      handle({ traceContext: context, args: [] }),
    );
    const span = envelope.telemetry.spans[0]!;
    expect(span.traceId).toBe('trc_parent');
    expect(span.parentSpanId).toBe('spn_parent');
  });

  it('encodes domain failure as Left with error span', async () => {
    const handle = makeRpcHandler('MockRpc.fail')(function* () {
      return yield* Effect.fail('domain-error' as const);
    });
    const envelope = await Effect.runPromise(
      handle({ traceContext: null, args: [] }),
    );
    expect(envelope.result).toEqual({ _tag: 'Left', left: 'domain-error' });
    expect(envelope.telemetry.spans[0]?.status).toBe('error');
  });
});
