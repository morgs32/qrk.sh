import type {
  IAnyAggregateFrontendController,
  IAnyServiceFrontendController,
} from '../frontendController/types.ts';

/** Reuse the authored selections in internal fixtures through an app factory. */
export function aggregateFrontendProps<
  const FRONTEND extends IAnyAggregateFrontendController,
>(
  frontend: FRONTEND,
): Omit<FRONTEND, 'kind' | 'systemName' | 'modelNames' | 'authentication'> & {
  authenticationSchema: FRONTEND['authentication']['authenticationSchema'];
} {
  const {
    kind: _kind,
    systemName: _systemName,
    modelNames: _modelNames,
    authentication,
    ...props
  } = frontend;
  return {
    ...props,
    authenticationSchema: authentication.authenticationSchema,
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
  const {
    kind: _kind,
    systemName: _systemName,
    modelNames: _modelNames,
    contracts: _contracts,
    authentication,
    ...props
  } = frontend;
  return {
    ...props,
    authenticationSchema: authentication.authenticationSchema,
  };
}
