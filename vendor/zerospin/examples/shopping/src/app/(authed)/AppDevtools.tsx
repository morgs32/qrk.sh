'use client';

import { ZerospinDevtools } from '@zerospin/devtools/ZerospinDevtools';

const devtoolsConfig = {
  defaultOpen: true,
  position: 'bottom-right' as const,
};

export function AppDevtools() {
  return <ZerospinDevtools config={devtoolsConfig} />;
}
