/* eslint-disable react-refresh/only-export-components */

import { Box } from 'ink';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { DeployWrangler } from '../deploy/DeployWrangler.js';

export const isDefault = true;

export default function Deploy() {
  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <DeployWrangler />
      </Box>
    </ErrorBoundary>
  );
}
