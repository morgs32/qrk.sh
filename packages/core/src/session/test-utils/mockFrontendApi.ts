import { BrandTypeId } from 'effect/Brand';
import { vi } from 'vitest';

import type { IFrontendControllerSpec } from '../../frontendController/types.ts';
import { encodeRight } from '../../utils/encodeRight.ts';

const stubFrontendSpec: IFrontendControllerSpec = {
  accountName: 'user',
  actorName: 'stub-frontend',
  frontendName: 'default',
  name: 'stub-frontend',
  version: '1.0.0',
  modelNames: [],
  models: {},
  contracts: {},
};

/** Concrete FrontendApi-shaped test double; every raw leaf returns a linked envelope. */
export const mockFrontendApi = {
  [BrandTypeId]: 'TargetApi',
  makeFrontendSpec: vi.fn(async () => ({
    result: encodeRight(stubFrontendSpec),
    link: null,
  })),
  getFrontendState: vi.fn(async () =>
    ({
      result: encodeRight({
        actorId: 'act_1',
        accountName: 'user',
        actorName: 'stub-frontend',
        frontendName: 'default',
        systemWorkerName: 'stub-deploy',
        frontendIndex: null,
        lastRebasedPushedCursor: null,
        pushedCommands: [],
        resources: [],
        executedPushedCommands: [],
        failedPushedCommands: [],
      }),
      link: null,
    })
  ),

  fetchActor: vi.fn(async () =>
    ({
      result: encodeRight({
        actor: {
          accountId: 'acct_1',
          actorId: 'act_1',
        },
        deployId: 'dpl_stub',
        generationId: 'gen_stub',
        systemId: 'sys_stub',
        systemVersion: '1.0.0',
        systemWorkerName: 'deploy_1',
        systemEnvironmentId: 'dev',
      }),
      link: null,
    })
  ),

  pushCommands: vi.fn(async () =>
    ({
      result: encodeRight({
        pendingCommands: [],
        pushedCommands: [],
        failedCommands: [],
      }),
      link: null,
    })
  ),

  executeServiceQuery: vi.fn(async () => ({
    result: encodeRight([]),
    link: null,
  })),

  executeActorQuery: vi.fn(async () => ({
    result: encodeRight([]),
    link: null,
  })),
};
