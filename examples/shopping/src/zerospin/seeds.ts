import { makeSeeds } from '@zerospin/sdk';

import { system } from './system';

export const seeds = makeSeeds({
  system,
  aggregates: {},
  services: {
    app: [
      system.services.app.makeCommand({
        contractName: 'createProduct',
        payload: {
          description: 'Classic cotton tee, comfortable everyday wear',
          name: 'Basic T-Shirt',
          price: 20,
        },
      }),
      system.services.app.makeCommand({
        contractName: 'createProduct',
        payload: {
          description: 'Sturdy canvas backpack with laptop sleeve',
          name: 'Canvas Backpack',
          price: 50,
        },
      }),
      system.services.app.makeCommand({
        contractName: 'createProduct',
        payload: {
          description: 'Wireless over-ear headphones, 30hr battery',
          name: 'Wireless Headphones',
          price: 90,
        },
      }),
      system.services.app.makeCommand({
        contractName: 'createProduct',
        payload: {
          description: 'Insulated stainless steel, keeps drinks cold 24hrs',
          name: 'Water Bottle',
          price: 25,
        },
      }),
      system.services.app.makeCommand({
        contractName: 'createProduct',
        payload: {
          description: 'A5 hardcover, 192 pages, acid-free paper',
          name: 'Lined Notebook',
          price: 12,
        },
      }),
      system.services.app.makeCommand({
        contractName: 'createProduct',
        payload: {
          description: '12oz ceramic mug, dishwasher safe',
          name: 'Ceramic Coffee Mug',
          price: 14,
        },
      }),
      system.services.app.makeCommand({
        contractName: 'createProduct',
        payload: {
          description: 'Dimmable warm/cool light with USB charging port',
          name: 'LED Desk Lamp',
          price: 45,
        },
      }),
      system.services.app.makeCommand({
        contractName: 'createProduct',
        payload: {
          description: 'Large stitched-edge cloth pad for work and play',
          name: 'Mouse Pad',
          price: 18,
        },
      }),
      system.services.app.makeCommand({
        contractName: 'createProduct',
        payload: {
          description: 'Braided USB-C to USB-C, 100W rated',
          name: 'USB-C Cable (2m)',
          price: 16,
        },
      }),
      system.services.app.makeCommand({
        contractName: 'createProduct',
        payload: {
          description: 'Midweight fleece, relaxed fit, front pouch',
          name: 'Fleece Hoodie',
          price: 55,
        },
      }),
      system.services.app.makeCommand({
        contractName: 'createProduct',
        payload: {
          description: 'UV400 protection, lightweight frames',
          name: 'Polarized Sunglasses',
          price: 35,
        },
      }),
      system.services.app.makeCommand({
        contractName: 'createProduct',
        payload: {
          description: 'Non-slip 5mm TPE, carry strap included',
          name: 'Yoga Mat',
          price: 32,
        },
      }),
    ],
  },
});
