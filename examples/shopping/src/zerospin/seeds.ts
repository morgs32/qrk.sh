import * as sdk from '@zerospin/sdk';
import { Effect } from 'effect';

import { appV1 } from './services/app/AppV1';
import { productV1 } from './services/app/models/product/ProductV1';

export const seeds = Effect.runSync(
  Effect.gen(function* () {
    return [
      yield* sdk.makeCommand(appV1, {
        contractName: 'createProduct',
        payload: {
          id: sdk.prefixId(productV1, 'seed-1'),
          description: 'Classic cotton tee, comfortable everyday wear',
          name: 'Basic T-Shirt',
          price: 20,
        },
      }),

      yield* sdk.makeCommand(appV1, {
        contractName: 'createProduct',
        payload: {
          id: sdk.prefixId(productV1, 'seed-2'),
          description: 'Sturdy canvas backpack with laptop sleeve',
          name: 'Canvas Backpack',
          price: 50,
        },
      }),

      yield* sdk.makeCommand(appV1, {
        contractName: 'createProduct',
        payload: {
          id: sdk.prefixId(productV1, 'seed-3'),
          description: 'Wireless over-ear headphones, 30hr battery',
          name: 'Wireless Headphones',
          price: 90,
        },
      }),

      yield* sdk.makeCommand(appV1, {
        contractName: 'createProduct',
        payload: {
          id: sdk.prefixId(productV1, 'seed-4'),
          description: 'Insulated stainless steel, keeps drinks cold 24hrs',
          name: 'Water Bottle',
          price: 25,
        },
      }),

      yield* sdk.makeCommand(appV1, {
        contractName: 'createProduct',
        payload: {
          id: sdk.prefixId(productV1, 'seed-5'),
          description: 'A5 hardcover, 192 pages, acid-free paper',
          name: 'Lined Notebook',
          price: 12,
        },
      }),

      yield* sdk.makeCommand(appV1, {
        contractName: 'createProduct',
        payload: {
          id: sdk.prefixId(productV1, 'seed-6'),
          description: '12oz ceramic mug, dishwasher safe',
          name: 'Ceramic Coffee Mug',
          price: 14,
        },
      }),

      yield* sdk.makeCommand(appV1, {
        contractName: 'createProduct',
        payload: {
          id: sdk.prefixId(productV1, 'seed-7'),
          description: 'Dimmable warm/cool light with USB charging port',
          name: 'LED Desk Lamp',
          price: 45,
        },
      }),

      yield* sdk.makeCommand(appV1, {
        contractName: 'createProduct',
        payload: {
          id: sdk.prefixId(productV1, 'seed-8'),
          description: 'Large stitched-edge cloth pad for work and play',
          name: 'Mouse Pad',
          price: 18,
        },
      }),

      yield* sdk.makeCommand(appV1, {
        contractName: 'createProduct',
        payload: {
          id: sdk.prefixId(productV1, 'seed-9'),
          description: 'Braided USB-C to USB-C, 100W rated',
          name: 'USB-C Cable (2m)',
          price: 16,
        },
      }),

      yield* sdk.makeCommand(appV1, {
        contractName: 'createProduct',
        payload: {
          id: sdk.prefixId(productV1, 'seed-10'),
          description: 'Midweight fleece, relaxed fit, front pouch',
          name: 'Fleece Hoodie',
          price: 55,
        },
      }),

      yield* sdk.makeCommand(appV1, {
        contractName: 'createProduct',
        payload: {
          id: sdk.prefixId(productV1, 'seed-11'),
          description: 'UV400 protection, lightweight frames',
          name: 'Polarized Sunglasses',
          price: 35,
        },
      }),

      yield* sdk.makeCommand(appV1, {
        contractName: 'createProduct',
        payload: {
          id: sdk.prefixId(productV1, 'seed-12'),
          description: 'Non-slip 5mm TPE, carry strap included',
          name: 'Yoga Mat',
          price: 32,
        },
      }),
    ];
  }).pipe(Effect.provide(sdk.NanoIdFactory)),
);
