import { makeContract } from '@zerospin/core/contracts/makeContract';
import { primitives } from '@zerospin/core/models/primitives';
import { Effect, Schema } from 'effect';

import { Car, Carpark, Destination, Garage, ParkingActor } from './models';

export const seedActor = makeContract({
  commandName: 'seedActor',
  payload: {
    id: ParkingActor.primaryKey({ autogenerate: true }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    created: ParkingActor.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: ParkingActor.create('1.0.0', {
        resourceId: payload.id,
        attributes: {
          name: payload.name,
        },
      }),
    }),
  version: '1.0.0',
});

export const createDestination = makeContract({
  commandName: 'createDestination',
  payload: {
    id: Destination.primaryKey({ autogenerate: true }),
    name: primitives.text(),
    slug: primitives.text(),
    lat: primitives.number(),
    lon: primitives.number(),
  },
  mutations: Schema.Struct({
    created: Destination.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: Destination.create('1.0.0', {
        resourceId: payload.id,
        attributes: {
          name: payload.name,
          slug: payload.slug,
          lat: payload.lat,
          lon: payload.lon,
        },
      }),
    }),
  version: '1.0.0',
});

export const createCarpark = makeContract({
  commandName: 'createCarpark',
  payload: {
    id: Carpark.primaryKey({ autogenerate: true }),
    destinationId: Destination.primaryKey({ autogenerate: false }),
    name: primitives.text(),
    address: primitives.text(),
    hourlyRate: primitives.number(),
    lat: primitives.number(),
    lon: primitives.number(),
    amenities: primitives.text({ nullable: true }),
  },
  mutations: Schema.Struct({
    created: Carpark.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: Carpark.create('1.0.0', {
        resourceId: payload.id,
        attributes: {
          destinationId: payload.destinationId,
          name: payload.name,
          address: payload.address,
          hourlyRate: payload.hourlyRate,
          lat: payload.lat,
          lon: payload.lon,
          amenities: payload.amenities,
        },
      }),
    }),
  version: '1.0.0',
});

export const updateCarpark = makeContract({
  commandName: 'updateCarpark',
  payload: {
    id: Carpark.primaryKey({ autogenerate: false }),
    name: primitives.text(),
    address: primitives.text(),
    hourlyRate: primitives.number(),
    lat: primitives.number(),
    lon: primitives.number(),
    amenities: primitives.text({ nullable: true }),
  },
  mutations: Schema.Struct({
    updated: Carpark.updateMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      updated: Carpark.update('1.0.0', {
        resourceId: payload.id,
        attributes: {
          name: payload.name,
          address: payload.address,
          hourlyRate: payload.hourlyRate,
          lat: payload.lat,
          lon: payload.lon,
          amenities: payload.amenities,
        },
      }),
    }),
  version: '1.0.0',
});

export const createGarage = makeContract({
  commandName: 'createGarage',
  payload: {
    id: Garage.primaryKey({ autogenerate: true }),
    actorId: primitives.opaqueId({ abbreviation: ParkingActor.abbreviation }),
    name: primitives.text(),
    address: primitives.text(),
  },
  mutations: Schema.Struct({
    created: Garage.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: Garage.create('1.0.0', {
        resourceId: payload.id,
        attributes: {
          actorId: payload.actorId,
          name: payload.name,
          address: payload.address,
        },
      }),
    }),
  version: '1.0.0',
});

export const createCar = makeContract({
  commandName: 'createCar',
  payload: {
    id: Car.primaryKey({ autogenerate: true }),
    actorId: primitives.opaqueId({ abbreviation: ParkingActor.abbreviation }),
    garageId: Garage.primaryKey({ autogenerate: false }),
    licensePlate: primitives.text(),
    make: primitives.text(),
    model: primitives.text(),
  },
  mutations: Schema.Struct({
    created: Car.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: Car.create('1.0.0', {
        resourceId: payload.id,
        attributes: {
          actorId: payload.actorId,
          garageId: payload.garageId,
          licensePlate: payload.licensePlate,
          make: payload.make,
          model: payload.model,
        },
      }),
    }),
  version: '1.0.0',
});
