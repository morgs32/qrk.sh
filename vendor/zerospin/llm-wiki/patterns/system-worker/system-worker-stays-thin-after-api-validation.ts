import { Effect } from 'effect';

/**
 * SystemWorker and repo DOs stay thin after FrontendApi / SystemApi validation.
 *
 * @bad Repeat `Schema.validate` on RPC props inside SystemWorker when the
 * public API capability already decoded the wire shape.
 * @bad Run trust-boundary `Schema.decodeUnknown` on caller input inside a repo DO.
 */
export class SystemWorker {
  makeSystemCommand(props: { contractName: string; payload: unknown }) {
    const { contractName, payload } = props;
    return managedRuntime.runPromise(
      makeSystemCommand({
        system,
        contractName,
        payload: payload as never,
      }).pipe(encodeRpc),
    );
  }
}

declare const managedRuntime: {
  runPromise: (effect: unknown) => Promise<unknown>;
};
declare const makeSystemCommand: (props: {
  system: unknown;
  contractName: string;
  payload: never;
}) => Effect.Effect<unknown, unknown, unknown>;
declare const encodeRpc: (effect: unknown) => unknown;
declare const system: unknown;
