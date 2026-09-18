import type {
  IAggregateAuthentication,
  IServiceAuthentication,
} from './types.ts';

declare const aggregate: Parameters<
  IAggregateAuthentication['authenticate']
>[0];
declare const service: Parameters<IServiceAuthentication['authenticate']>[0];
void aggregate.executeCommand;
void service.signature;
// @ts-expect-error Service authentication cannot provision aggregate commands.
void service.executeCommand;
