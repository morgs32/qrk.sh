import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { makeZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { shopperActorV1 } from '../../src/zerospin/aggregates/shopper/actors/shopperActorV1';
import { ClerkUserIdSchema } from '../../src/zerospin/aggregates/shopper/models/user/UserV1';
import { appServiceV1 } from '../../src/zerospin/services/app/appServiceV1';
import { verifyClerkIdentity } from '../../src/zerospin/verifyClerkIdentity';

vi.mock('../../src/zerospin/verifyClerkIdentity', () => ({
  verifyClerkIdentity: vi.fn(),
}));
const clerkUserId =
  Schema.decodeUnknownSync(ClerkUserIdSchema)('user_verified');

describe('Shopping credentials and identity', () => {
  it('provisions with verified identity and returns it without credentials', async () => {
    vi.mocked(verifyClerkIdentity).mockReturnValue(Effect.succeed(clerkUserId));
    const policy = shopperActorV1.authentication;
    if (policy === 'none') {
      throw new Error('Shopping requires credential verification');
    }
    let provisioned: unknown;
    const identity = await Effect.runPromise(
      policy
        .authenticate({
          credentials: { token: 'secret' },
          executeCommand: props => {
            provisioned = props;
            return Effect.succeed(
              Schema.decodeUnknownSync(
                Schema.toType(AggregateChainedCommandSchema),
              )({
                id: 'cmd_provision',
                commandName: props.contract.commandName,
                contractVersion: props.contract.version,
                aggregateId: props.aggregateId,
                aggregateName: 'shopper',
                aggregateVersion: '1.0.0',
                systemName: 'shopping',
                actorName: props.actor.name,
                actorVersion: props.actor.version,
                identity: props.identity,
                nodeId: null,
                nodeIndex: null,
                payload: JSON.stringify(props.payload),
                sessionName: null,
                aggregateIndex: 1,
                admission: {
                  status: 'succeeded',
                  startedAt: new Date(),
                  completedAt: new Date(),
                },
                execution: {
                  status: 'succeeded',
                  startedAt: new Date(),
                  completedAt: new Date(),
                  executionDelta: { inserted: [], updated: [], deleted: [] },
                },
                dispositionHash: null,
              }),
            );
          },
        })
        .pipe(Effect.provide(NanoIdFactory), Effect.provide(AsyncLive)),
    );
    expect(verifyClerkIdentity).toHaveBeenCalledWith({ token: 'secret' });
    expect(identity).toEqual({ aggregateId: 'acct_1', clerkUserId });
    expect(provisioned).toMatchObject({
      identity,
      actor: { name: 'provisioner' },
    });
    expect(JSON.stringify(identity)).not.toContain('secret');
  });
  it('keeps catalog verification and rejects failed credentials before provisioning', async () => {
    const catalog =
      appServiceV1.versions['1.0.0'].actors.default.authentication;
    const shopper = shopperActorV1.authentication;
    if (catalog === 'none' || shopper === 'none') {
      throw new Error('Shopping requires credential verification');
    }
    vi.mocked(verifyClerkIdentity).mockReturnValue(Effect.succeed(clerkUserId));
    expect(
      await Effect.runPromise(
        catalog
          .authenticate({ credentials: { token: 'secret' } })
          .pipe(Effect.provide(NanoIdFactory), Effect.provide(AsyncLive)),
      ),
    ).toEqual({ clerkUserId });
    vi.mocked(verifyClerkIdentity).mockReturnValue(
      Effect.fail(makeZerospinError('clerk-session-invalid')),
    );
    const provision = vi.fn(() => Effect.die('Unexpected provisioning'));
    await expect(
      Effect.runPromise(
        shopper
          .authenticate({
            credentials: { token: 'bad' },
            executeCommand: provision,
          })
          .pipe(Effect.provide(NanoIdFactory), Effect.provide(AsyncLive)),
      ),
    ).rejects.toThrow('clerk-session-invalid');
    expect(provision).not.toHaveBeenCalled();
  });
});
