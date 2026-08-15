import type { IAnyErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect, type Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import type { SystemRepo } from '../SystemRepo/SystemRepo.js';

import { getDeploy } from './getDeploy/getDeploy.js';
import { getReadiness } from './getReadiness/getReadiness.js';
import { startDeploy } from './startDeploy/startDeploy.js';

export class DevDeployApi extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  readonly #systemRepo: Pick<
    SystemRepo,
    'getDeploy' | 'getReadiness' | 'startDeploy'
  >;

  constructor(props: {
    systemRepo: Pick<SystemRepo, 'getDeploy' | 'getReadiness' | 'startDeploy'>;
  }) {
    super();
    this.#systemRepo = props.systemRepo;
  }

  async startDeploy(request: { clean: boolean }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        activationCheckpoint:
          | 'allocated'
          | 'generation-prepared'
          | 'continuous-replay'
          | 'pre-cut-ready'
          | 'ownership-cut'
          | 'source-writes-terminal'
          | 'fixed-point-drained'
          | 'final-replay-complete';
        clean: boolean;
        deployId: string;
        failure: IAnyErrorJson | null;
        generationId: string;
        status: 'activating' | 'succeeded' | 'failed';
        workerVersionId: string;
      }>,
      IAnyErrorJson
    >
  > {
    return Effect.runPromise(
      startDeploy({ request, systemRepo: this.#systemRepo }),
    );
  }

  async getDeploy(request: { deployId: string }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        activationCheckpoint:
          | 'allocated'
          | 'generation-prepared'
          | 'continuous-replay'
          | 'pre-cut-ready'
          | 'ownership-cut'
          | 'source-writes-terminal'
          | 'fixed-point-drained'
          | 'final-replay-complete';
        clean: boolean;
        deployId: string;
        failure: IAnyErrorJson | null;
        generationId: string;
        status: 'activating' | 'succeeded' | 'failed';
        workerVersionId: string;
      }>,
      IAnyErrorJson
    >
  > {
    return Effect.runPromise(
      getDeploy({ request, systemRepo: this.#systemRepo }),
    );
  }

  async getReadiness(): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return Effect.runPromise(getReadiness({ systemRepo: this.#systemRepo }));
  }
}
