import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { makeZerospinError } from '@zerospin/error';

import { makeServiceNodeDefinition } from './makeServiceNodeDefinition.ts';
import { serviceNodeNetwork } from './serviceNodeNetwork.ts';
import type { IServiceNodeRequest } from './serviceNodeRequest.ts';
import { serviceSessionDiscovery } from './serviceSessionDiscovery.ts';

export async function resolveServiceNode(props: {
  request: IServiceNodeRequest;
  getAdmission(): Promise<IAdmissionRequest>;
  expectedClaims?: Readonly<Record<string, unknown>> | undefined;
  revision: number;
}) {
  // Provider errors are not evidence that the server is unreachable.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const admission = await Promise.race([
    props.getAdmission(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(makeZerospinError({ code: 'node-admission-unavailable' })),
        5000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
  try {
    const snapshot = await serviceNodeNetwork(
      props.request,
      admission,
    ).snapshot(null);
    assertSessionClaims(props.expectedClaims, snapshot.claims);
    return {
      definition: await makeServiceNodeDefinition(
        props.request,
        snapshot.claims,
      ),
      attachment: {
        request: props.request,
        claims: snapshot.claims,
        revision: props.revision,
        online: true,
      },
      admission,
    };
  } catch (error) {
    const unavailable =
      error instanceof Error &&
      'code' in error &&
      (error.code === 'node-network-unavailable' ||
        (error.code === 'async-failed' &&
          'extra' in error &&
          typeof error.extra === 'object' &&
          error.extra !== null &&
          'networkUnavailable' in error.extra &&
          error.extra.networkUnavailable === true));
    if (!unavailable) throw error;
    if (props.expectedClaims === undefined) {
      throw makeZerospinError({ code: 'node-offline-claims-required' });
    }
    const remembered = await serviceSessionDiscovery.find(
      props.request,
      props.expectedClaims,
    );
    return {
      definition: await makeServiceNodeDefinition(
        props.request,
        remembered.claims,
      ),
      attachment: {
        request: props.request,
        claims: remembered.claims,
        revision: props.revision,
        online: false,
      },
      admission: null,
    };
  }
}
