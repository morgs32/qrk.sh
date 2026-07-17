'use client';

import { makeReactFrontend } from '@zerospin/react/makeReactFrontend';

import { ownerFrontend, providerAdminFrontend } from '@/zerospin/frontends';

export const ZerospinProviderAdmin = makeReactFrontend({
  frontend: providerAdminFrontend,
});

export const ZerospinOwner = makeReactFrontend({
  frontend: ownerFrontend,
});
