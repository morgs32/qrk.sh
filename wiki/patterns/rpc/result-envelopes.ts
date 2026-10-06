import { makeZerospinError } from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import { Effect } from 'effect';

/**
 * Browser worker RPC without telemetry returns direct domain commands, arrays, or values.
 * A rejected Promise carries existing public error fields, preserving code/message/status/extra
 * and any declared public business scope. The boundary excludes diagnostic stack and cause;
 * the receiving browser restores the public Zerospin Error through restoreRpcError.
 * Never manufacture an id-only receipt where a retained staged/terminal command is available.
 *
 * Server RPC that owns telemetry retains makeRpcEnvelope/readRpcEnvelope for { result, telemetry }.
 * External APIs persist telemetry and return { result, link }; failed telemetry persistence
 * leaves the settled domain result intact and produces no link. Domain admission controls
 * on browser sockets stay explicit; aggregate controls retain the optional telemetry link.
 * Direct terminal delivery and replay arrays do not need a result or command wrapper.
 *
 * Results in telemetry boundaries contain success values or encoded public failures.
 * Persisted business failures keep their original codec version and bytes independently
 * of adapted disclosure. encodeRpcOutcome serializes Effect outcomes without transmitting
 * runtime Error prototypes. A rejected Promise remains distinct from a resolved Failure.
 *
 * @bad Put stack text or private diagnostic cause into a public failure.
 * @bad Replace a valid domain outcome with a telemetry persistence failure.
 * @bad Treat a rejected Promise as though it were a resolved Failure.
 * @bad Add result/command wrappers to nontelemetry browser worker operations.
 */
export const refused = Effect.fail(
  makeZerospinError({ code: 'access-denied', message: 'Access denied' }),
).pipe(Effect.withSpan('refused'), makeRpcEnvelope);
