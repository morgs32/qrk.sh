import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { Schema } from 'effect';

import {
  createCar,
  createCarpark,
  createDestination,
  createGarage,
  seedActor,
  updateCarpark,
} from './contracts';
import { Car, Carpark, Destination, Garage, ParkingActor } from './models';

const signature = Schema.Struct({
  clerkUserId: Schema.String,
});

export const providerAdminFrontend = makeFrontendController({
  contracts: {
    seedActor,
    createDestination,
    createCarpark,
    updateCarpark,
  },
  accountName: 'provider',
  actorName: 'admin',
  frontendName: 'backend',
  version: '1.0.0',
  systemName: 'parking',
  models: {
    parkingActor: ParkingActor,
    destination: Destination,
    carpark: Carpark,
  },
  signature,
});

export const ownerFrontend = makeFrontendController({
  contracts: {
    seedActor,
    createGarage,
    createCar,
  },
  accountName: 'driver',
  actorName: 'owner',
  frontendName: 'backend',
  version: '1.0.0',
  systemName: 'parking',
  models: {
    parkingActor: ParkingActor,
    garage: Garage,
    car: Car,
  },
  signature,
});
