import type { Connection } from 'partyserver';
import { Effect } from 'effect';

/*
 * The public worker spends the service ticket before forwarding this request.
 * Its private header binds this connection to the authenticated frontend code
 * while the service archive remains shared by compatible same-generation code.
 */
export const onConnect = Effect.fn('ServiceFrontendBlockRepo.onConnect')(
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
