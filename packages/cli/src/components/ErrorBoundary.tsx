/* eslint-disable no-console */
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Box, Text } from 'ink';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  componentStack: null | string;
  error: Error | null;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = {
    componentStack: null,
    error: null,
  };

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({
      componentStack: info.componentStack ?? null,
      error,
    });

    console.error(error);
    if (info.componentStack) {
      console.error('Component stack:', info.componentStack);
    }
  }

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <Box flexDirection="column">
        <Text color="red">Unexpected error: {this.state.error.message}</Text>
        <Text dimColor>Check stderr for component stack.</Text>
      </Box>
    );
  }
}
