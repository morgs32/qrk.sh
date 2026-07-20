import { useState } from 'react';

import { useSession } from '@zerospin/react/useSession';

/**
 * Never render pending UI for `stageCommand`; staging is an immediate local optimistic action.
 *
 * @bad Disable the initiating control while `stageCommand` settles.
 * @bad Render loading text or a spinner for local command staging.
 * @bad Wait for command push or server confirmation before following the staged local result.
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
          void session
            .stageCommand({
              contractName: 'createItem',
              payload: {},
            })
            .then(result => {
              if (result._tag === 'Left') {
                setError(result.left.message);
                return;
              }

              navigate(`/items/${result.right.payload.id}`);
            });
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
