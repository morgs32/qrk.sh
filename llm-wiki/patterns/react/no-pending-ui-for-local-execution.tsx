import { useState } from 'react';

import { useSession } from '@zerospin/react/useSession';

/**
 * Never render pending UI for `executeCommand`; it is an immediate local optimistic action.
 *
 * @bad Disable the initiating control while local execution settles.
 * @bad Render loading text or a spinner for the local command journal write.
 * @bad Wait for server push or authoritative finalization before following the local result.
 */
export function CreateItemButton() {
  const session = useSession(ItemFrontend);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          const result = session.executeCommand({
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

declare const ItemFrontend: Parameters<typeof useSession>[0];
declare function navigate(href: string): void;
