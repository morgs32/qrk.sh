import type {
  IAnyAggregateFrontendController,
  IAnyServiceFrontendController,
} from '../frontendController/types.ts';

/** Reuse the authored selections in internal fixtures through an unbound factory. */
export function aggregateFrontendProps<
  const FRONTEND extends IAnyAggregateFrontendController,
>(
  frontend: FRONTEND,
): Omit<FRONTEND, 'kind' | 'systemName' | 'modelNames' | 'authentication'> & {
  authenticationSchema: FRONTEND['authentication']['authenticationSchema'];
} {
  return {
    authenticationSchema: frontend.authentication.authenticationSchema,
    aggregateName: frontend.aggregateName,
    aggregateVersion: frontend.aggregateVersion,
    name: frontend.name,
    models: frontend.models,
    contracts: frontend.contracts,
    ...(frontend.guardLayer === undefined
      ? {}
      : { guardLayer: frontend.guardLayer }),
  } as Omit<FRONTEND, 'kind' | 'systemName' | 'modelNames' | 'authentication'> & {
    authenticationSchema: FRONTEND['authentication']['authenticationSchema'];
  };
}

export function serviceFrontendProps<
  const FRONTEND extends IAnyServiceFrontendController,
>(
  frontend: FRONTEND,
): Omit<
  FRONTEND,
  'kind' | 'systemName' | 'modelNames' | 'contracts' | 'authentication'
> & {
  authenticationSchema: FRONTEND['authentication']['authenticationSchema'];
} {
  return {
    authenticationSchema: frontend.authentication.authenticationSchema,
    serviceName: frontend.serviceName,
    serviceVersion: frontend.serviceVersion,
    name: frontend.name,
    models: frontend.models,
  } as Omit<
    FRONTEND,
    'kind' | 'systemName' | 'modelNames' | 'contracts' | 'authentication'
  > & {
    authenticationSchema: FRONTEND['authentication']['authenticationSchema'];
  };
}
