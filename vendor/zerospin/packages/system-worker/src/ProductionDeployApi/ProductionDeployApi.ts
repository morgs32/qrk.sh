import type { IAnyErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect, type Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import type { SystemRepo } from '../SystemRepo/SystemRepo.js';

import { getReadiness } from './getReadiness/getReadiness.js';

export class ProductionDeployApi extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  readonly #systemRepo: Pick<SystemRepo, 'getReadiness'>;

  constructor(props: { systemRepo: Pick<SystemRepo, 'getReadiness'> }) {
    super();
    this.#systemRepo = props.systemRepo;
  }

  async getReadiness(): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return Effect.runPromise(getReadiness({ systemRepo: this.#systemRepo }));
  }
}
