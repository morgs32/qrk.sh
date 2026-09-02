import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeSignature } from '../../authentication/makeSignature.ts';
import { makeContract } from '../../contracts/makeContract.ts';
import { makeFrontendController } from '../../frontendController/makeFrontendController.ts';
import { makeGuard } from '../../guards/makeGuard.ts';
import { makeModel } from '../../models/makeModel.ts';
import { makeSelection } from '../../models/makeSelection.ts';
import type { InferResource } from '../../models/types.ts';
import { makeSystem } from '../makeSystem.ts';

describe('makeSystem', () => {
  /**
   * 1 — Define one authoritative model, contract, guard, and frontend binding.
   * 2 — Build the aggregate with those exact shared identities.
   * 3 — Verify normalization preserves the guard and model identities.
   */
  it('retains guards bound to the authoritative aggregate model identity', () => {
    // 1 — Bind the guard and frontend to the same authoritative model object.
    const Item = makeModel(
      {
        abbreviation: 'git',
        modelName: 'guardItem',
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );
    const renameItem = makeContract({
      commandName: 'renameItem',
      payload: {
        id: Item.primaryKey({ autogenerate: false }),
        name: primitives.text(),
      },
      mutations: Schema.Struct({
        updated: Item.updateMutation('1.0.0'),
      }),
      program: ({ payload }) =>
        Effect.all({
          updated: Item.update('1.0.0', {
            resourceId: payload.id,
            attributes: { name: payload.name },
          }),
        }),
      version: '1.0.0',
    });
    const guard = makeGuard({
      contract: renameItem,
      models: { guardItem: Item },
      program: () => Effect.void,
    });
    const controller = makeFrontendController({
      systemName: 'guard-system',
      aggregateName: 'account',
      frontendName: 'web',
      contracts: { renameItem },
      models: { guardItem: Item },
      guards: { renameItem: [guard] },
    });

    // 2 — Normalize the aggregate without substituting any model identity.
    const system = makeSystem({
      name: 'guard-system',
      version: '1.0.0',
      authentication: {
        signature: makeSignature(
          { version: '1.0.0', schema: Schema.Struct({}) },
          [],
        ),
        authenticate: () => Effect.succeed('user'),
      },
      aggregates: {
        account: {
          authorize: () => Effect.void,
          models: { guardItem: Item },
          contracts: { renameItem },
          selections: {
            guardItem: makeSelection({ model: Item, where: () => ({}) }),
          },
          frontends: { web: { controller } },
        },
      },
    });

    // 3 — The normalized frontend retains both the guard and its model object.
    const frontend = system.aggregates.account.frontends.web;
    if (frontend === undefined) {
      throw new Error('aggregate frontend was not normalized');
    }
    expect(frontend.controller.guards).toEqual({
      renameItem: [guard],
    });
    expect(guard.models.guardItem).toBe(Item);
  });

  /**
   * 1 — Define separate command, authoritative source, and projected identities.
   * 2 — Bind a guard to the projected frontend identity.
   * 3 — Reject projection wiring that presents it as an authoritative query model.
   */
  it('rejects guards that query a projected frontend model identity', () => {
    // 1 — Keep command, source, and projected model identities distinct.
    const Command = makeModel(
      {
        abbreviation: 'gcm',
        modelName: 'guardCommand',
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );
    const Source = makeModel(
      {
        abbreviation: 'gsc',
        modelName: 'guardSource',
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );
    const Projected = makeModel(
      {
        abbreviation: 'gpr',
        modelName: 'guardProjected',
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );
    const createCommand = makeContract({
      commandName: 'createCommand',
      payload: {
        id: Command.primaryKey({ autogenerate: false }),
        name: primitives.text(),
      },
      mutations: Schema.Struct({
        created: Command.createMutation('1.0.0'),
      }),
      program: ({ payload }) =>
        Effect.all({
          created: Command.create('1.0.0', {
            resourceId: payload.id,
            attributes: { name: payload.name },
          }),
        }),
      version: '1.0.0',
    });

    // 2 — The frontend may render the projection, but its guard queries that identity.
    const guard = makeGuard({
      contract: createCommand,
      models: { guardProjected: Projected },
      program: () => Effect.void,
    });
    const controller = makeFrontendController({
      systemName: 'guard-projection-system',
      aggregateName: 'account',
      frontendName: 'web',
      contracts: { createCommand },
      models: { guardCommand: Command, guardProjected: Projected },
      guards: { createCommand: [guard] },
    });

    // 3 — Projection adapters cannot make the guard's query identity authoritative.
    expect(() =>
      makeSystem({
        name: 'guard-projection-system',
        version: '1.0.0',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {
          account: {
            authorize: () => Effect.void,
            models: { guardCommand: Command, guardSource: Source },
            contracts: { createCommand },
            selections: {
              guardCommand: makeSelection({
                model: Command,
                where: () => ({}),
              }),
              guardSource: makeSelection({
                model: Source,
                where: () => ({}),
              }),
            },
            frontends: {
              web: {
                controller,
                models: {
                  guardCommand: 'guardCommand',
                  guardProjected: 'guardSource',
                },
                projectionAdapters: {
                  guardProjected: (resource: InferResource<typeof Source>) =>
                    Effect.succeed({
                      ...resource,
                      id: Projected.prefixId(resource.id),
                      modelName: Projected.modelName,
                      version: Projected.version,
                    }),
                },
              },
            },
          },
        },
      }),
    ).toThrow(
      /must be identity-bound to authoritative aggregate model "guardProjected"/,
    );
  });
});
