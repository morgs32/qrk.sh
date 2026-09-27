import { Effect, Result } from 'effect';
import { expect } from 'vitest';

/**
 * Test malformed caller props only on the public RpcTarget that decodes them.
 * Assert the handler's mapped error code and that the next repo or chain call did not run.
 *
 * @bad Schema.decodeUnknown catalog whose only subject is a schema (NOT-A-HASH, legacy fields, LowerDashCaseSchema).
 * @bad toThrow(Schema.SchemaError) for an excess field, structural copy, or authorize: true.
 * @bad Catalog of values JSON.stringify cannot encode (bigint, NaN, Map).
 * @bad Negative decode on a reader of bytes this process encoded (journal replay, outbox receive).
 */
export async function rejectMalformedHealthcheckArgs(props: {
  api: {
    healthcheck: (request: { args: unknown[]; traceContext: null }) => Promise<{
      result: unknown;
      link: null;
    }>;
  };
  appendTelemetryBatch: { mock: { calls: unknown[] } };
  readResult: (result: unknown) => Effect.Effect<unknown, { code: string }>;
}) {
  const envelope = await Reflect.apply(props.api.healthcheck, props.api, [
    { args: ['unexpected'], traceContext: null },
  ]);
  const result = await Effect.runPromise(
    props.readResult(envelope.result).pipe(Effect.result),
  );

  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure.code).toBe('system-api-arguments-invalid');
  }
  expect(envelope.link).toBe(null);
  expect(props.appendTelemetryBatch.mock.calls).toHaveLength(0);
}
