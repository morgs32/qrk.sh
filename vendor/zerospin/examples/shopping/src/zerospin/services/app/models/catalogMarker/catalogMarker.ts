import { models } from '@zerospin/sdk/browser';

// This service-owned row is intentionally absent from catalogFrontend. The
// workerd acceptance flow mutates it to prove an irrelevant service change
// advances the source serviceIndex without allocating a finalized frontend
// index.
export const catalogMarker = models.makeModel({
  name: 'catalogMarker',
  abbreviation: 'cmk',
});
