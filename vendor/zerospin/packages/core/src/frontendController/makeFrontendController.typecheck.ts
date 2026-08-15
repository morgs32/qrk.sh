import { Effect, Schema } from 'effect';

import { makeContract } from '../contracts/makeContract.ts';
import { makeGuard } from '../guards/makeGuard.ts';
import { makeModel } from '../models/makeModel.ts';
import { primitives } from '../models/primitives.ts';

import { makeFrontendController } from './makeFrontendController.ts';
import { makeSignature } from './makeSignature.ts';

const signature = makeSignature(
  { version: '1.0.0', schema: Schema.Struct({}) },
  [],
);

const aggregateFrontend = makeFrontendController({
  systemName: 'test',
  aggregateName: 'user',
  frontendName: 'web',
  userId: Schema.NonEmptyString,
  models: {},
  contracts: {},
  signature,
});

const aggregateName: 'user' = aggregateFrontend.aggregateName;
const aggregateFrontendName: 'web' = aggregateFrontend.frontendName;
void aggregateName;
void aggregateFrontendName;
// @ts-expect-error — frontend controllers do not expose controller SemVer.
void aggregateFrontend.version;

const serviceFrontend = makeFrontendController({
  systemName: 'test',
  serviceName: 'catalog',
  frontendName: 'browse',
  userId: Schema.NonEmptyString,
  models: {},
  signature,
});

const serviceName: 'catalog' = serviceFrontend.serviceName;
const serviceFrontendName: 'browse' = serviceFrontend.frontendName;
void serviceName;
void serviceFrontendName;
// @ts-expect-error — frontend controllers do not expose controller SemVer.
void serviceFrontend.version;

makeFrontendController({
  systemName: 'test',
  frontendName: 'invalid',
  userId: Schema.NonEmptyString,
  models: {},
  signature,
  // @ts-expect-error — a controller must identify either its aggregate or its service
  contracts: {},
});

makeFrontendController({
  systemName: 'test',
  aggregateName: 'user',
  frontendName: 'missing-version',
  models: {},
  contracts: {},
  userId: Schema.NonEmptyString,
  signature,
});

const GuardList = makeModel(
  {
    abbreviation: 'gls',
    modelName: 'guardList',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
  [],
);
const GuardUser = makeModel(
  {
    abbreviation: 'gus',
    modelName: 'guardUser',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
  [],
);
const renameGuardList = makeContract({
  commandName: 'renameGuardList',
  payload: {
    id: GuardList.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    updated: GuardList.updateMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      updated: GuardList.update('1.0.0', {
        resourceId: payload.id,
        attributes: { name: payload.name },
      }),
    }),
  version: '1.0.0',
});
const declaredModelGuard = makeGuard({
  contract: renameGuardList,
  models: { list: GuardList },
  program: ({ db, payload }) => {
    db.query.list.findFirst({ where: { id: { eq: payload.id } } }).sync();
    // @ts-expect-error — a guard cannot query a model it did not declare
    void db.query.user;
    // @ts-expect-error — authored guard databases expose no mutation API
    void db.insert;
    // @ts-expect-error — authored guard databases expose no raw SQL API
    void db.run;
    // @ts-expect-error — authored guard databases expose no transaction API
    void db.transaction;
    // @ts-expect-error — authored guard databases expose no underlying client
    void db.$client;
    return Effect.void;
  },
});
const guardedController = makeFrontendController({
  systemName: 'guard-type-test',
  aggregateName: 'account',
  frontendName: 'web',
  contracts: { renameGuardList },
  models: { list: GuardList, user: GuardUser },
  guards: { renameGuardList: [declaredModelGuard] },
});
const retainedGuard = guardedController.guards.renameGuardList[0];
if (retainedGuard !== undefined) {
  const retainedDeclaredModel: typeof GuardList = retainedGuard.models.list;
  void retainedDeclaredModel;
  // @ts-expect-error — normalized guards retain the concrete declared model keys
  void retainedGuard.models.user;
}
