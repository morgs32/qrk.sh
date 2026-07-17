'use client';

import { makeReactFrontend } from '@zerospin/react/makeReactFrontend';

import { shopperFrontend } from '@/zerospin/frontend';

export const ZerospinShopper = makeReactFrontend({
  frontend: shopperFrontend,
  isPushPaused: true,
});
