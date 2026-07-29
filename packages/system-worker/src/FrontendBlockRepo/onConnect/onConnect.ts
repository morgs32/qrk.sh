import type { Connection } from 'partyserver';
import { Effect } from 'effect';

/*
 * The public worker spends the WebSocket ticket before forwarding this request.
 * Its private header binds this connection to the exact authenticated frontend
 * version without making the shared generation archive version-specific.
 */
export const onConnect = Effect.fn('FrontendBlockRepo.onConnect')(
  function* (props: {
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      frontendVersion: string;
    }>;
    request: Request;
  }) {
    yield* Effect.void;

    const frontendVersion = props.request.headers.get(
      'x-zerospin-frontend-version',
    );
    if (frontendVersion === null || frontendVersion.length === 0) {
      props.connection.close(4004, 'frontend-version-required');
      return;
    }

    props.connection.setState({
      phase: 'awaiting-resume',
      frontendVersion,
    });
  },
);
