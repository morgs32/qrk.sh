import { BrandTypeId } from 'effect/Brand';
import { vi } from 'vitest';

import type { IFrontendControllerSpec } from '../../frontendController/types.ts';
import { encodeRight } from '../../utils/encodeRight.ts';

const stubFrontendSpec: IFrontendControllerSpec = {
  kind: 'aggregate',
  systemName: 'stub-system',
  aggregateName: 'user',
  frontendName: 'default',
  modelNames: [],
  models: {},
  contracts: {},
  aggregateFrontendLock: {
    systemName: 'stub-system',
    frontendName: 'default',
    models: {},
    contracts: {},
  },
};

/** Concrete AggregateFrontendApi-shaped test double; every raw leaf returns a linked envelope. */
export const mockAggregateFrontendApi = {
  [BrandTypeId]: 'TargetApi',
  getAdmission: vi.fn(async () => ({
    result: encodeRight({
      actorRef: {
        aggregateId: 'acct_1',
        aggregateName: 'user',
        userId: 'act_1',
      },
      aggregateFrontendLock: stubFrontendSpec.aggregateFrontendLock,
      frontendName: stubFrontendSpec.frontendName,
      frontendSpec: stubFrontendSpec,
      systemId: 'sys_stub',
      systemVersion: '1.0.0',
    }),
    link: null,
  })),
  getState: vi.fn(async () => ({
    result: encodeRight({
      userId: 'act_1',
      systemId: 'sys_stub',
      systemVersion: '1.0.0',
      aggregateId: 'acct_1',
      aggregateName: 'user',
      frontendName: 'default',
      frontendIndex: null,
      pushedCommands: [],
      resources: [],
      executedPushedCommands: [],
      failedPushedCommands: [],
    }),
    link: null,
  })),

  createWebSocketTicket: vi.fn(async () => ({
    result: encodeRight({ ticket: 'test_frontend_websocket_ticket' }),
    link: null,
  })),

  pushCommands: vi.fn(async () => ({
    result: encodeRight({
      pendingCommands: [],
      pushedCommands: [],
      failedCommands: [],
    }),
    link: null,
  })),

  executeServiceQuery: vi.fn(async () => ({
    result: encodeRight([]),
    link: null,
  })),

  executeAggregateQuery: vi.fn(async () => ({
    result: encodeRight([]),
    link: null,
  })),
};
