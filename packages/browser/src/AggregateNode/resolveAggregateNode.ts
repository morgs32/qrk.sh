import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { makeZerospinError } from '@zerospin/error';

import { aggregateNodeNetwork } from './aggregateNodeNetwork.ts';
import type { IAggregateNodeRequest } from './aggregateNodeRequest.ts';
import { aggregateSessionDiscovery } from './aggregateSessionDiscovery.ts';
import { makeAggregateNodeDefinition } from './makeAggregateNodeDefinition.ts';

export async function resolveAggregateNode(props: {
  request: IAggregateNodeRequest;
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
    const snapshot = await aggregateNodeNetwork(
      props.request,
      admission,
    ).snapshot(null);
    assertSessionClaims(props.expectedClaims, snapshot.claims);
    return {
      definition: await makeAggregateNodeDefinition(
        props.request,
        snapshot.claims,
        snapshot.aggregateId,
      ),
      attachment: {
        request: props.request,
        claims: snapshot.claims,
        aggregateId: snapshot.aggregateId,
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
    const remembered = await aggregateSessionDiscovery.find(
      props.request,
      props.expectedClaims,
    );
    return {
      definition: await makeAggregateNodeDefinition(
        props.request,
        remembered.claims,
        remembered.aggregateId,
      ),
      attachment: {
        request: props.request,
        claims: remembered.claims,
        aggregateId: remembered.aggregateId,
        revision: props.revision,
        online: false,
      },
      admission: null,
    };
  }
}
