import { useParams } from 'react-router';

import { useAggregateSession, useServiceSession } from '../useSession';

import { SessionsDatabaseModelRowsTable } from './SessionsDatabaseModelRowsTable';

function decodeModelNameParam(modelName: string): string {
  try {
    return decodeURIComponent(modelName);
  } catch {
    return modelName;
  }
}

export function SessionsDatabaseModelRoute() {
  const aggregateSession = useAggregateSession();
  const serviceSession = useServiceSession();
  const { modelName } = useParams();

  if (
    (aggregateSession === undefined && serviceSession === undefined) ||
    modelName === undefined
  ) {
    return null;
  }

  const decoded = decodeModelNameParam(modelName);

  const isDeclaredAggregateModel =
    aggregateSession !== undefined &&
    Object.hasOwn(aggregateSession.frontend.models, decoded);
  const isDeclaredServiceModel =
    serviceSession !== undefined &&
    serviceSession.getModelAttributes(decoded) !== undefined;

  if (!isDeclaredAggregateModel && !isDeclaredServiceModel) {
    return <span>Unknown model key: {decoded}</span>;
  }

  return <SessionsDatabaseModelRowsTable modelKey={decoded} />;
}
