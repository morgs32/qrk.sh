import { makeAccountController } from '@zerospin/core/accountController/makeAccountController';
import { makeActorController } from '@zerospin/core/actorController/makeActorController';
import { makeAuthorize } from '@zerospin/core/authorize/makeAuthorize';
import { makeSelection } from '@zerospin/core/models/makeSelection';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import {
  createCar,
  createCarpark,
  createDestination,
  createGarage,
  seedActor,
  updateCarpark,
} from './contracts';
import { ownerFrontend, providerAdminFrontend } from './frontends';
import { Car, Carpark, Destination, Garage, ParkingActor } from './models';

const backendAccountId = makeAccountId({ id: '1' });

export const providerAdmin = makeActorController({
  name: 'admin',
  version: '1.0.0',
  models: {
    parkingActor: ParkingActor,
    destination: Destination,
    carpark: Carpark,
  },
  selections: {
    parkingActor: makeSelection({
      model: ParkingActor,
      where: ({ actorId }) => ({ id: actorId }),
    }),
    destination: makeSelection({
      model: Destination,
      where: () => ({}),
    }),
    carpark: makeSelection({
      model: Carpark,
      where: () => ({}),
    }),
  },
  frontends: {
    backend: {
      frontendController: providerAdminFrontend,
      authenticate: props =>
        Effect.gen(function* () {
          const actorId = ParkingActor.prefixId(props.signature.clerkUserId);
          const actor = props.db.query.parkingActor
            .findFirst({
              where: { id: { eq: actorId } },
            })
            .sync();
          if (actor !== undefined) {
            return {
              actorId,
              accountId: backendAccountId,
            };
          }

          const seedActorCommand = yield* props.makeAccountCommand({
            contractName: 'seedActor',
            payload: {
              id: actorId,
              name: props.signature.clerkUserId,
            },
          });
          yield* props.finalizeAccountCommands({
            commands: [seedActorCommand],
          });
          const createdActor = props.db.query.parkingActor
            .findFirst({
              where: { id: { eq: actorId } },
            })
            .sync();
          if (createdActor === undefined) {
            return yield* new ZerospinError({
              code: 'parking-actor-create-failed',
              message: `Parking actor ${actorId} was not created`,
              status: 500,
            });
          }
          return {
            actorId,
            accountId: backendAccountId,
          };
        }),
    },
  },
  authorize: makeAuthorize({
    frontendController: providerAdminFrontend,
    authorize: Effect.fn('providerAdminAuthorize')(function* ({ actorId, db }) {
      const actor = db.query.parkingActor
        .findFirst({
          where: { id: { eq: actorId } },
        })
        .sync();
      if (actor === undefined) {
        return yield* new ZerospinError({
          code: 'parking-provider-admin-not-found',
          message: `Provider admin actor ${actorId} was not found`,
          status: 404,
        });
      }
    }),
  }),
});

export const owner = makeActorController({
  name: 'owner',
  version: '1.0.0',
  models: {
    parkingActor: ParkingActor,
    garage: Garage,
    car: Car,
  },
  selections: {
    parkingActor: makeSelection({
      model: ParkingActor,
      where: ({ actorId }) => ({ id: actorId }),
    }),
    garage: makeSelection({
      model: Garage,
      where: ({ actorId }) => ({ actorId }),
    }),
    car: makeSelection({
      model: Car,
      where: ({ actorId }) => ({ actorId }),
    }),
  },
  frontends: {
    backend: {
      frontendController: ownerFrontend,
      authenticate: props =>
        Effect.gen(function* () {
          const actorId = ParkingActor.prefixId(props.signature.clerkUserId);
          const actor = props.db.query.parkingActor
            .findFirst({
              where: { id: { eq: actorId } },
            })
            .sync();
          if (actor !== undefined) {
            return {
              actorId,
              accountId: backendAccountId,
            };
          }

          const seedActorCommand = yield* props.makeAccountCommand({
            contractName: 'seedActor',
            payload: {
              id: actorId,
              name: props.signature.clerkUserId,
            },
          });
          yield* props.finalizeAccountCommands({
            commands: [seedActorCommand],
          });
          const createdActor = props.db.query.parkingActor
            .findFirst({
              where: { id: { eq: actorId } },
            })
            .sync();
          if (createdActor === undefined) {
            return yield* new ZerospinError({
              code: 'parking-actor-create-failed',
              message: `Parking actor ${actorId} was not created`,
              status: 500,
            });
          }
          return {
            actorId,
            accountId: backendAccountId,
          };
        }),
    },
  },
  authorize: makeAuthorize({
    frontendController: ownerFrontend,
    authorize: Effect.fn('ownerAuthorize')(function* ({ actorId, db }) {
      const actor = db.query.parkingActor
        .findFirst({
          where: { id: { eq: actorId } },
        })
        .sync();
      if (actor === undefined) {
        return yield* new ZerospinError({
          code: 'parking-owner-not-found',
          message: `Owner actor ${actorId} was not found`,
          status: 404,
        });
      }
    }),
  }),
});

export const providerAccount = makeAccountController({
  name: 'provider',
  version: '1.0.0',
  actorControllers: {
    admin: providerAdmin,
  },
  models: {
    parkingActor: ParkingActor,
    destination: Destination,
    carpark: Carpark,
  },
  contracts: {
    seedActor,
    createDestination,
    createCarpark,
    updateCarpark,
  },
});

export const driverAccount = makeAccountController({
  name: 'driver',
  version: '1.0.0',
  actorControllers: {
    owner,
  },
  models: {
    parkingActor: ParkingActor,
    garage: Garage,
    car: Car,
  },
  contracts: {
    seedActor,
    createGarage,
    createCar,
  },
});

export const system = makeSystem({
  accountControllers: {
    provider: providerAccount,
    driver: driverAccount,
  },
  name: 'parking',
  version: '1.0.0',
});
