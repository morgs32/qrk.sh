import { useState } from 'react';

import { stageCommand } from '@zerospin/react';

/**
 * Never render pending UI for `stageCommand`; it is an immediate local optimistic action.
 *
 * @bad Disable the initiating control while local staging settles.
 * @bad Render loading text or a spinner for the local command journal write.
 * @bad Wait for server push or authoritative finalization before following the local result.
 */
export function CreateItemButton() {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          const result = stageCommand({
            session: itemSession,
            contractName: 'createItem',
            payload: {},
          });
          if (result._tag === 'Failure') {
            setError(result.failure.message);
            return;
          }

          navigate(`/items/${result.success.payload.id}`);
        }}
      >
        Create item
      </button>
      {error === null ? null : <p role="alert">{error}</p>}
    </>
  );
}

declare const itemSession: Parameters<typeof stageCommand>[0]['session'];
declare function navigate(href: string): void;
