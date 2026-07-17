import { makeModel } from '@zerospin/core/models/makeModel';
import { primitives } from '@zerospin/core/models/primitives';

export const ParkingActor = makeModel(
  {
    abbreviation: 'actr',
    modelName: 'parkingActor',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const Destination = makeModel(
  {
    abbreviation: 'dst',
    modelName: 'destination',
    attributes: {
      name: primitives.text(),
      slug: primitives.text(),
      lat: primitives.number(),
      lon: primitives.number(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const Carpark = makeModel(
  {
    abbreviation: 'cpk',
    modelName: 'carpark',
    attributes: {
      destinationId: primitives.ref({
        table: Destination.table,
        relation: 'destination',
        inverse: 'carparks',
      }),
      name: primitives.text(),
      address: primitives.text(),
      hourlyRate: primitives.number(),
      lat: primitives.number(),
      lon: primitives.number(),
      amenities: primitives.text({ nullable: true }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const Garage = makeModel(
  {
    abbreviation: 'gar',
    modelName: 'garage',
    attributes: {
      actorId: primitives.opaqueId({ abbreviation: ParkingActor.abbreviation }),
      name: primitives.text(),
      address: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const Car = makeModel(
  {
    abbreviation: 'car',
    modelName: 'car',
    attributes: {
      actorId: primitives.opaqueId({ abbreviation: ParkingActor.abbreviation }),
      garageId: primitives.ref({
        table: Garage.table,
        relation: 'garage',
        inverse: 'cars',
      }),
      licensePlate: primitives.text(),
      make: primitives.text(),
      model: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);
