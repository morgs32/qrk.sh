import { useParams } from 'react-router';

import { useAccountSession, useServiceSession } from '../useSession';

import { SessionsDatabaseModelRowsTable } from './SessionsDatabaseModelRowsTable';

function decodeModelNameParam(modelName: string): string {
  try {
    return decodeURIComponent(modelName);
  } catch {
    return modelName;
  }
}

export function SessionsDatabaseModelRoute() {
  const accountSession = useAccountSession();
  const serviceSession = useServiceSession();
  const { modelName } = useParams();

  if (
    (accountSession === undefined && serviceSession === undefined) ||
    modelName === undefined
  ) {
    return null;
  }

  const decoded = decodeModelNameParam(modelName);

  const isDeclaredAccountModel =
    accountSession !== undefined &&
    Object.hasOwn(accountSession.frontend.models, decoded);
  const isDeclaredServiceModel =
    serviceSession !== undefined &&
    serviceSession.getModelAttributes(decoded) !== undefined;

  if (!isDeclaredAccountModel && !isDeclaredServiceModel) {
    return <span>Unknown model key: {decoded}</span>;
  }

  return <SessionsDatabaseModelRowsTable modelKey={decoded} />;
}
