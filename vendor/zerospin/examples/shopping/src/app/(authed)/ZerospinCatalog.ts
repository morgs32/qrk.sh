'use client';

import { makeReactServiceFrontend } from '@zerospin/react/makeReactServiceFrontend';

import { catalogFrontend } from '@/zerospin/frontend';

export const ZerospinCatalog = makeReactServiceFrontend({
  frontend: catalogFrontend,
});
