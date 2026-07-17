import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { Effect } from 'effect';

import { ownerFrontend, providerAdminFrontend } from './frontends';
import { ParkingActor } from './models';
import { driverAccount, providerAccount, system } from './system';

const accountId = makeAccountId({ id: '1' });
const providerActorId = ParkingActor.prefixId('provider_seed');
const driverActorId = ParkingActor.prefixId('driver_seed');
const destinationId = 'dst_downtown';
const garageId = 'gar_home';

export const seeds = Effect.all([
  providerAccount.makeCommand({
    contractName: 'seedActor',
    accountId,
    systemName: providerAdminFrontend.systemName,
    systemVersion: system.version,
    payload: {
      id: providerActorId,
      name: 'Provider Admin',
    },
  }),
  providerAccount.makeCommand({
    contractName: 'createDestination',
    accountId,
    systemName: providerAdminFrontend.systemName,
    systemVersion: system.version,
    payload: {
      id: destinationId,
      name: 'Downtown',
      slug: 'downtown',
      lat: 41.8781,
      lon: -87.6298,
    },
  }),
  providerAccount.makeCommand({
    contractName: 'createCarpark',
    accountId,
    systemName: providerAdminFrontend.systemName,
    systemVersion: system.version,
    payload: {
      destinationId,
      name: 'Loop Garage',
      address: '100 W Monroe St',
      hourlyRate: 18,
      lat: 41.8808,
      lon: -87.6309,
      amenities: 'EV charging, covered parking, attendants',
    },
  }),
  providerAccount.makeCommand({
    contractName: 'createCarpark',
    accountId,
    systemName: providerAdminFrontend.systemName,
    systemVersion: system.version,
    payload: {
      destinationId,
      name: 'River North Lot',
      address: '420 N Clark St',
      hourlyRate: 12,
      lat: 41.8897,
      lon: -87.6317,
      amenities: 'Open air, mobile entry',
    },
  }),
  driverAccount.makeCommand({
    contractName: 'seedActor',
    accountId,
    systemName: ownerFrontend.systemName,
    systemVersion: system.version,
    payload: {
      id: driverActorId,
      name: 'Driver Owner',
    },
  }),
  driverAccount.makeCommand({
    contractName: 'createGarage',
    accountId,
    systemName: ownerFrontend.systemName,
    systemVersion: system.version,
    payload: {
      id: garageId,
      actorId: driverActorId,
      name: 'Home Garage',
      address: '221 W Lake St',
    },
  }),
  driverAccount.makeCommand({
    contractName: 'createCar',
    accountId,
    systemName: ownerFrontend.systemName,
    systemVersion: system.version,
    payload: {
      actorId: driverActorId,
      garageId,
      licensePlate: 'PARK-101',
      make: 'Tesla',
      model: 'Model 3',
    },
  }),
]);
