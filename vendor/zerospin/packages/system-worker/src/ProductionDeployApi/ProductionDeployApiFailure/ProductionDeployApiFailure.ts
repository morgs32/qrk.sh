import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import type { ProductionDeployApi } from '../ProductionDeployApi.js';

import { getReadiness } from './getReadiness/getReadiness.js';

export class ProductionDeployApiFailure extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  constructor(private readonly error: IAnyError) {
    super();
  }

  async getReadiness(): ReturnType<ProductionDeployApi['getReadiness']> {
    return Effect.runPromise(getReadiness({ error: this.error }));
  }
}
