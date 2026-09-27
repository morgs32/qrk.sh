import * as sdk from '@zerospin/sdk/browser';

// This service-owned row is intentionally absent from catalogSession. The
// workerd acceptance flow mutates it to prove an irrelevant service change
// advances the source serviceIndex without allocating a selected definition
// index.
export const catalogMarker = sdk.defineModel({
  name: 'catalogMarker',
  abbreviation: 'cmk',
});
