import { makeSeeds } from '@zerospin/core/system/makeSeeds';

import { appService, system } from './system';

export const seeds = makeSeeds({
  system,
  accounts: {},
  services: {
    app: [
      appService.makeCommand({
        contractName: 'createProduct',
        systemVersion: system.version,
        payload: {
          description: 'Classic cotton tee, comfortable everyday wear',
          name: 'Basic T-Shirt',
          price: 20,
        },
      }),
      appService.makeCommand({
        contractName: 'createProduct',
        systemVersion: system.version,
        payload: {
          description: 'Sturdy canvas backpack with laptop sleeve',
          name: 'Canvas Backpack',
          price: 50,
        },
      }),
      appService.makeCommand({
        contractName: 'createProduct',
        systemVersion: system.version,
        payload: {
          description: 'Wireless over-ear headphones, 30hr battery',
          name: 'Wireless Headphones',
          price: 90,
        },
      }),
      appService.makeCommand({
        contractName: 'createProduct',
        systemVersion: system.version,
        payload: {
          description: 'Insulated stainless steel, keeps drinks cold 24hrs',
          name: 'Water Bottle',
          price: 25,
        },
      }),
      appService.makeCommand({
        contractName: 'createProduct',
        systemVersion: system.version,
        payload: {
          description: 'A5 hardcover, 192 pages, acid-free paper',
          name: 'Lined Notebook',
          price: 12,
        },
      }),
      appService.makeCommand({
        contractName: 'createProduct',
        systemVersion: system.version,
        payload: {
          description: '12oz ceramic mug, dishwasher safe',
          name: 'Ceramic Coffee Mug',
          price: 14,
        },
      }),
      appService.makeCommand({
        contractName: 'createProduct',
        systemVersion: system.version,
        payload: {
          description: 'Dimmable warm/cool light with USB charging port',
          name: 'LED Desk Lamp',
          price: 45,
        },
      }),
      appService.makeCommand({
        contractName: 'createProduct',
        systemVersion: system.version,
        payload: {
          description: 'Large stitched-edge cloth pad for work and play',
          name: 'Mouse Pad',
          price: 18,
        },
      }),
      appService.makeCommand({
        contractName: 'createProduct',
        systemVersion: system.version,
        payload: {
          description: 'Braided USB-C to USB-C, 100W rated',
          name: 'USB-C Cable (2m)',
          price: 16,
        },
      }),
      appService.makeCommand({
        contractName: 'createProduct',
        systemVersion: system.version,
        payload: {
          description: 'Midweight fleece, relaxed fit, front pouch',
          name: 'Fleece Hoodie',
          price: 55,
        },
      }),
      appService.makeCommand({
        contractName: 'createProduct',
        systemVersion: system.version,
        payload: {
          description: 'UV400 protection, lightweight frames',
          name: 'Polarized Sunglasses',
          price: 35,
        },
      }),
      appService.makeCommand({
        contractName: 'createProduct',
        systemVersion: system.version,
        payload: {
          description: 'Non-slip 5mm TPE, carry strap included',
          name: 'Yoga Mat',
          price: 32,
        },
      }),
    ],
  },
});
