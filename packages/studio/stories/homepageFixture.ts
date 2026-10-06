import type { ISystemSpec } from '@zerospin/core/system/types';
import { RpcTarget } from 'capnweb';
import type { State } from 'swr';

import { fixtureAgentSpec } from '../src/fixtures/agents.js';

export const aggregateName = 'fixture/tenant #1';
export const aggregateVersion = '1.0.0+fixture';
const agentNames = ['admin', 'reader/review #1'];

export const systemSpec: ISystemSpec = {
  systemName: 'Studio homepage stories',
  agents: Object.fromEntries(
    agentNames.map(name => [
      name,
      { ...fixtureAgentSpec, name, aggregateName, aggregateVersion },
    ]),
  ),
  aggregates: {
    [aggregateName]: {
      [aggregateVersion]: {
        name: aggregateName,
        version: aggregateVersion,
        models: fixtureAgentSpec.models,
        actors: {
          admin: {
            name: 'admin',
            version: '1.0.0',
            models: fixtureAgentSpec.models,
            authentication: 'system',
            identity: {
              claimsJsonSchema: {},
              identityJsonSchema: {},
              pattern: '/:aggregateId',
            },
            selections: fixtureAgentSpec.selections,
            contracts: fixtureAgentSpec.contracts,
          },
        },
      },
    },
  },
  services: {},
};

const aggregateIds = [
  'acct_alpha',
  'acct_beta',
  'acct_team/space ?#%',
  `acct_long_${'x'.repeat(140)}`,
];

export type IHomepageOptions = {
  scenario:
    | 'registered'
    | 'loading'
    | 'failure'
    | 'empty'
    | 'no-agents'
    | 'invalid';
  description: string;
  probe?: 'off' | 'primary' | 'secondary' | 'version';
  theme?: 'light' | 'dark' | 'system';
  blockedStorage?: boolean;
  refresh?: boolean;
  events?: boolean;
};

/** One story run owns its requests, held responses, and SWR cache. */
export class HomepageFixture {
  readonly cache = new Map<string, State>();
  readonly requests: string[] = [];
  readonly pendingResponses = new Map<number, () => void>();
  readonly runId = crypto.randomUUID();
  failNextQuery = false;
  private registrationRevision = 0;
  private revision = 0;
  private disposed = false;
  private readonly listeners = new Set<() => void>();

  constructor(readonly scenario: IHomepageOptions['scenario']) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.revision;

  private publish() {
    if (this.disposed) return;
    this.revision++;
    for (const listener of this.listeners) listener();
  }

  addRegisteredId() {
    this.registrationRevision++;
    this.publish();
  }

  failNext() {
    this.failNextQuery = true;
    this.publish();
  }

  getAgentAggregateIds(props: {
    aggregateName: string;
    aggregateVersion: string;
  }) {
    this.requests.push(`${props.aggregateName}@${props.aggregateVersion}`);
    const requestNumber = this.requests.length;
    this.publish();
    if (
      this.failNextQuery ||
      (this.scenario === 'failure' && requestNumber === 1)
    ) {
      this.failNextQuery = false;
      this.publish();
      return {
        _tag: 'Failure' as const,
        failure: {
          _tag: 'ZerospinError' as const,
          code: 'fixture-ids-unavailable',
          message: 'Fixture IDs unavailable.',
          status: null,
          extra: null,
        },
      };
    }
    const ids =
      this.scenario === 'empty'
        ? []
        : this.scenario === 'invalid'
          ? ['invalid-id']
          : props.aggregateName !== aggregateName
            ? ['acct_secondary']
            : props.aggregateVersion !== aggregateVersion
              ? ['acct_version_two']
              : [
                  ...aggregateIds,
                  ...Array.from(
                    { length: this.registrationRevision },
                    (_, index) => `acct_new_${index + 1}`,
                  ),
                ].sort();
    const outcome = { _tag: 'Success' as const, success: ids };
    if (this.scenario !== 'loading' || this.disposed) return outcome;
    return new Promise<typeof outcome>(resolve => {
      this.pendingResponses.set(requestNumber, () => {
        this.pendingResponses.delete(requestNumber);
        resolve(outcome);
        this.publish();
      });
      this.publish();
    });
  }

  dispose() {
    this.disposed = true;
    for (const release of [...this.pendingResponses.values()]) release();
    this.listeners.clear();
  }
}

/** Cap'n Web still encodes the response consumed by the production client. */
export class FixtureStudioAgentApi extends RpcTarget {
  constructor(private readonly fixture: HomepageFixture) {
    super();
  }

  getAgentAggregateIds(props: {
    aggregateName: string;
    aggregateVersion: string;
  }) {
    return this.fixture.getAgentAggregateIds(props);
  }
}

export function setUpStoryAppearance(options: IHomepageOptions) {
  const preferenceKey = 'zerospin-studio-home-theme';
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  let storage: Storage | undefined;
  let savedPreference: string | null | undefined;
  try {
    storage = window.localStorage;
    savedPreference = storage.getItem(preferenceKey);
    storage.setItem(preferenceKey, options.theme ?? 'light');
  } catch {
    // StudioHome itself handles unavailable preference storage.
  }

  if (options.blockedStorage) {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException(
          'Story storage is unavailable.',
          'SecurityError',
        );
      },
    });
  }

  return () => {
    if (options.blockedStorage) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(window, 'localStorage');
      } else {
        Object.defineProperty(window, 'localStorage', descriptor);
      }
    }
    try {
      if (storage !== undefined && savedPreference !== undefined) {
        if (savedPreference === null) {
          storage.removeItem(preferenceKey);
        } else {
          storage.setItem(preferenceKey, savedPreference);
        }
      }
    } catch {
      // An unavailable original preference store remains optional.
    }
  };
}
