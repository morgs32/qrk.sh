import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import type { DevDeployApi } from '../DevDeployApi.js';

import { getDeploy } from './getDeploy/getDeploy.js';
import { getReadiness } from './getReadiness/getReadiness.js';
import { startDeploy } from './startDeploy/startDeploy.js';

export class DevDeployApiFailure extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  constructor(private readonly error: IAnyError) {
    super();
  }

  async startDeploy(
    request: Parameters<DevDeployApi['startDeploy']>[0],
  ): ReturnType<DevDeployApi['startDeploy']> {
    return Effect.runPromise(startDeploy({ error: this.error, request }));
  }

  async getDeploy(
    request: Parameters<DevDeployApi['getDeploy']>[0],
  ): ReturnType<DevDeployApi['getDeploy']> {
    return Effect.runPromise(getDeploy({ error: this.error, request }));
  }

  async getReadiness(): ReturnType<DevDeployApi['getReadiness']> {
    return Effect.runPromise(getReadiness({ error: this.error }));
  }
}
