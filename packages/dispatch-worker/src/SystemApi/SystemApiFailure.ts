import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { type IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { BrandTypeId } from 'effect/Brand';

import type { SystemApi } from './SystemApi';

export class SystemApiFailure extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  constructor(private readonly error: IAnyError) {
    super();
  }

  async hello(
    _request: Parameters<SystemApi['hello']>[0],
  ): ReturnType<SystemApi['hello']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getFrontendState(
    _request: Parameters<SystemApi['getFrontendState']>[0],
  ): ReturnType<SystemApi['getFrontendState']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async executeServiceQuery(
    _request: Parameters<SystemApi['executeServiceQuery']>[0],
  ): ReturnType<SystemApi['executeServiceQuery']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async finalizeAccountCommands(
    _request: Parameters<SystemApi['finalizeAccountCommands']>[0],
  ): ReturnType<SystemApi['finalizeAccountCommands']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async executeSelectQuery(
    _request: Parameters<SystemApi['executeSelectQuery']>[0],
  ): ReturnType<SystemApi['executeSelectQuery']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async finalizeServiceCommands(
    _request: Parameters<SystemApi['finalizeServiceCommands']>[0],
  ): ReturnType<SystemApi['finalizeServiceCommands']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getSystemRepos(
    _request: Parameters<SystemApi['getSystemRepos']>[0],
  ): ReturnType<SystemApi['getSystemRepos']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getSystemRepoTableRows(
    _request: Parameters<SystemApi['getSystemRepoTableRows']>[0],
  ): ReturnType<SystemApi['getSystemRepoTableRows']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getAccountRepos(
    _request: Parameters<SystemApi['getAccountRepos']>[0],
  ): ReturnType<SystemApi['getAccountRepos']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getAccountRepoTableRows(
    _request: Parameters<SystemApi['getAccountRepoTableRows']>[0],
  ): ReturnType<SystemApi['getAccountRepoTableRows']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getAuthorizationRepos(
    _request: Parameters<SystemApi['getAuthorizationRepos']>[0],
  ): ReturnType<SystemApi['getAuthorizationRepos']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getAuthorizationRepoTableRows(
    _request: Parameters<SystemApi['getAuthorizationRepoTableRows']>[0],
  ): ReturnType<SystemApi['getAuthorizationRepoTableRows']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getActorRepos(
    _request: Parameters<SystemApi['getActorRepos']>[0],
  ): ReturnType<SystemApi['getActorRepos']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getActorRepoTableRows(
    _request: Parameters<SystemApi['getActorRepoTableRows']>[0],
  ): ReturnType<SystemApi['getActorRepoTableRows']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getFrontendRepos(
    _request: Parameters<SystemApi['getFrontendRepos']>[0],
  ): ReturnType<SystemApi['getFrontendRepos']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getFrontendRepoTableRows(
    _request: Parameters<SystemApi['getFrontendRepoTableRows']>[0],
  ): ReturnType<SystemApi['getFrontendRepoTableRows']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getServiceRepos(
    _request: Parameters<SystemApi['getServiceRepos']>[0],
  ): ReturnType<SystemApi['getServiceRepos']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getServiceRepoTableRows(
    _request: Parameters<SystemApi['getServiceRepoTableRows']>[0],
  ): ReturnType<SystemApi['getServiceRepoTableRows']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getAccountBlockRepos(
    _request: Parameters<SystemApi['getAccountBlockRepos']>[0],
  ): ReturnType<SystemApi['getAccountBlockRepos']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getAccountBlockRepoTableRows(
    _request: Parameters<SystemApi['getAccountBlockRepoTableRows']>[0],
  ): ReturnType<SystemApi['getAccountBlockRepoTableRows']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getActorBlockRepos(
    _request: Parameters<SystemApi['getActorBlockRepos']>[0],
  ): ReturnType<SystemApi['getActorBlockRepos']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getActorBlockRepoTableRows(
    _request: Parameters<SystemApi['getActorBlockRepoTableRows']>[0],
  ): ReturnType<SystemApi['getActorBlockRepoTableRows']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getFrontendBlockRepos(
    _request: Parameters<SystemApi['getFrontendBlockRepos']>[0],
  ): ReturnType<SystemApi['getFrontendBlockRepos']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getFrontendBlockRepoTableRows(
    _request: Parameters<SystemApi['getFrontendBlockRepoTableRows']>[0],
  ): ReturnType<SystemApi['getFrontendBlockRepoTableRows']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getServiceBlockRepos(
    _request: Parameters<SystemApi['getServiceBlockRepos']>[0],
  ): ReturnType<SystemApi['getServiceBlockRepos']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getServiceBlockRepoTableRows(
    _request: Parameters<SystemApi['getServiceBlockRepoTableRows']>[0],
  ): ReturnType<SystemApi['getServiceBlockRepoTableRows']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getSystemLogRepos(
    _request: Parameters<SystemApi['getSystemLogRepos']>[0],
  ): ReturnType<SystemApi['getSystemLogRepos']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async getSystemLogRepoTableRows(
    _request: Parameters<SystemApi['getSystemLogRepoTableRows']>[0],
  ): ReturnType<SystemApi['getSystemLogRepoTableRows']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }

  async makeSystemSpec(
    _request: Parameters<SystemApi['makeSystemSpec']>[0],
  ): ReturnType<SystemApi['makeSystemSpec']> {
    return {
      result: encodeLeft(this.error),
      link: null,
    };
  }
}
