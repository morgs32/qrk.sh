import { appV1 } from './services/app/AppV1';
import { productV1 } from './services/app/models/product/ProductV1';

export const basicTShirt = appV1.makeCommand({
  contractName: 'createProduct',
  payload: {
    id: productV1.prefixId('seed-1'),
    description: 'Classic cotton tee, comfortable everyday wear',
    name: 'Basic T-Shirt',
    price: 20,
  },
});

export const canvasBackpack = appV1.makeCommand({
  contractName: 'createProduct',
  payload: {
    id: productV1.prefixId('seed-2'),
    description: 'Sturdy canvas backpack with laptop sleeve',
    name: 'Canvas Backpack',
    price: 50,
  },
});

export const wirelessHeadphones = appV1.makeCommand({
  contractName: 'createProduct',
  payload: {
    id: productV1.prefixId('seed-3'),
    description: 'Wireless over-ear headphones, 30hr battery',
    name: 'Wireless Headphones',
    price: 90,
  },
});

export const waterBottle = appV1.makeCommand({
  contractName: 'createProduct',
  payload: {
    id: productV1.prefixId('seed-4'),
    description: 'Insulated stainless steel, keeps drinks cold 24hrs',
    name: 'Water Bottle',
    price: 25,
  },
});

export const linedNotebook = appV1.makeCommand({
  contractName: 'createProduct',
  payload: {
    id: productV1.prefixId('seed-5'),
    description: 'A5 hardcover, 192 pages, acid-free paper',
    name: 'Lined Notebook',
    price: 12,
  },
});

export const ceramicCoffeeMug = appV1.makeCommand({
  contractName: 'createProduct',
  payload: {
    id: productV1.prefixId('seed-6'),
    description: '12oz ceramic mug, dishwasher safe',
    name: 'Ceramic Coffee Mug',
    price: 14,
  },
});

export const ledDeskLamp = appV1.makeCommand({
  contractName: 'createProduct',
  payload: {
    id: productV1.prefixId('seed-7'),
    description: 'Dimmable warm/cool light with USB charging port',
    name: 'LED Desk Lamp',
    price: 45,
  },
});

export const mousePad = appV1.makeCommand({
  contractName: 'createProduct',
  payload: {
    id: productV1.prefixId('seed-8'),
    description: 'Large stitched-edge cloth pad for work and play',
    name: 'Mouse Pad',
    price: 18,
  },
});

export const usbCCable = appV1.makeCommand({
  contractName: 'createProduct',
  payload: {
    id: productV1.prefixId('seed-9'),
    description: 'Braided USB-C to USB-C, 100W rated',
    name: 'USB-C Cable (2m)',
    price: 16,
  },
});

export const fleeceHoodie = appV1.makeCommand({
  contractName: 'createProduct',
  payload: {
    id: productV1.prefixId('seed-10'),
    description: 'Midweight fleece, relaxed fit, front pouch',
    name: 'Fleece Hoodie',
    price: 55,
  },
});

export const polarizedSunglasses = appV1.makeCommand({
  contractName: 'createProduct',
  payload: {
    id: productV1.prefixId('seed-11'),
    description: 'UV400 protection, lightweight frames',
    name: 'Polarized Sunglasses',
    price: 35,
  },
});

export const yogaMat = appV1.makeCommand({
  contractName: 'createProduct',
  payload: {
    id: productV1.prefixId('seed-12'),
    description: 'Non-slip 5mm TPE, carry strap included',
    name: 'Yoga Mat',
    price: 32,
  },
});
