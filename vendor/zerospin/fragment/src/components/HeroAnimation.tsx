import { useRef } from 'react';

import { CommandChain, type CommandChainHandle } from './CommandChain';
import { initialCommandRows, makeCommandRow } from './commandChainRows';
import { TaskItem } from './TaskItem';

export function HeroAnimation() {
  const chain = useRef<CommandChainHandle>(null);
  const nextId = useRef(25);
  const activeRow = useRef<number | null>(null);
  return (
    <>
      <CommandChain ref={chain} initialRows={initialCommandRows} />
      <TaskItem
        onReplay={() => {
          chain.current?.reset();
          nextId.current = 25;
          activeRow.current = null;
        }}
        onCommand={step => {
          const id = nextId.current++;
          const previous = activeRow.current;
          chain.current?.apply({
            prepend: makeCommandRow(id, step, step.kind === 'edit'),
            cellUpdates:
              step.kind === 'edit' && previous !== null
                ? Array.from({ length: 6 }, (_, column) => ({
                    rowId: previous,
                    column,
                    cell: { blurred: true },
                  }))
                : [],
          });
          if (step.kind === 'edit') activeRow.current = id;
        }}
      />
    </>
  );
}
