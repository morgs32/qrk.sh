import { describe, expect, it } from 'vitest';

import { seeds } from '../../src/zerospin/seeds';

describe('Shopping seeds', () => {
  it('exports all twelve resolved product commands in catalog order', () => {
    expect(seeds.map(command => command.payload)).toEqual([
      {
        id: 'prd_seed-1',
        description: 'Classic cotton tee, comfortable everyday wear',
        name: 'Basic T-Shirt',
        price: 20,
      },
      {
        id: 'prd_seed-2',
        description: 'Sturdy canvas backpack with laptop sleeve',
        name: 'Canvas Backpack',
        price: 50,
      },
      {
        id: 'prd_seed-3',
        description: 'Wireless over-ear headphones, 30hr battery',
        name: 'Wireless Headphones',
        price: 90,
      },
      {
        id: 'prd_seed-4',
        description: 'Insulated stainless steel, keeps drinks cold 24hrs',
        name: 'Water Bottle',
        price: 25,
      },
      {
        id: 'prd_seed-5',
        description: 'A5 hardcover, 192 pages, acid-free paper',
        name: 'Lined Notebook',
        price: 12,
      },
      {
        id: 'prd_seed-6',
        description: '12oz ceramic mug, dishwasher safe',
        name: 'Ceramic Coffee Mug',
        price: 14,
      },
      {
        id: 'prd_seed-7',
        description: 'Dimmable warm/cool light with USB charging port',
        name: 'LED Desk Lamp',
        price: 45,
      },
      {
        id: 'prd_seed-8',
        description: 'Large stitched-edge cloth pad for work and play',
        name: 'Mouse Pad',
        price: 18,
      },
      {
        id: 'prd_seed-9',
        description: 'Braided USB-C to USB-C, 100W rated',
        name: 'USB-C Cable (2m)',
        price: 16,
      },
      {
        id: 'prd_seed-10',
        description: 'Midweight fleece, relaxed fit, front pouch',
        name: 'Fleece Hoodie',
        price: 55,
      },
      {
        id: 'prd_seed-11',
        description: 'UV400 protection, lightweight frames',
        name: 'Polarized Sunglasses',
        price: 35,
      },
      {
        id: 'prd_seed-12',
        description: 'Non-slip 5mm TPE, carry strap included',
        name: 'Yoga Mat',
        price: 32,
      },
    ]);
    expect(
      seeds.every(command => command.commandName === 'createProduct'),
    ).toBe(true);
    expect(new Set(seeds.map(command => command.id)).size).toBe(12);
  });
});
