import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { makeZerospinError } from '@zerospin/error';

import { makeNodeDefinition } from './makeNodeDefinition.ts';
import { makeNodeRecovery } from './makeNodeRecovery.ts';
import { nodeNetwork } from './nodeNetwork.ts';
import type { INodeRequest } from './nodeRequest.ts';
import { sessionDiscovery } from './sessionDiscovery.ts';

export async function resolveNode(props: {
  request: INodeRequest;
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
    const snapshot = await nodeNetwork(props.request, admission).snapshot(null);
    assertSessionClaims(props.expectedClaims, snapshot.claims);
    const targetId =
      'aggregateId' in snapshot ? snapshot.aggregateId : snapshot.serviceName;
    return {
      definition: await makeNodeDefinition(
        props.request,
        snapshot.claims,
        targetId,
      ),
      attachment: {
        request: props.request,
        claims: snapshot.claims,
        targetId,
        revision: props.revision,
        online: true,
        baseline: makeNodeRecovery(snapshot),
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
    const remembered = await sessionDiscovery.find(
      props.request,
      props.expectedClaims,
    );
    return {
      definition: await makeNodeDefinition(
        props.request,
        remembered.claims,
        remembered.targetId,
      ),
      attachment: {
        request: props.request,
        claims: remembered.claims,
        targetId: remembered.targetId,
        revision: props.revision,
        online: false,
        baseline: null,
      },
      admission: null,
    };
  }
}
