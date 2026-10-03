import { useEffect, useEffectEvent } from 'react';

import { CharacterStatusIndicator } from './CharacterStatusIndicator';
import {
  checkedDelay,
  replayDelay,
  stepDelay,
  taskItemScript,
  typingDelay,
} from './taskItemScript';
import { useTaskItemStore } from './taskItemStore';
import './TaskItem.css';

export function TaskItem({
  onCommand,
  onReplay,
}: {
  onCommand?: (step: (typeof taskItemScript)[number]) => void;
  onReplay?: () => void;
}) {
  const {
    rows,
    stepIndex,
    phase,
    advance,
    finishCollapse,
    finishExpand,
    reset,
  } = useTaskItemStore();
  const step = taskItemScript[stepIndex];
  const activeRow =
    step.kind === 'edit' &&
    (phase === 'editing' || phase === 'holding' || phase === 'checked')
      ? step.row
      : null;

  const notifyReplay = useEffectEvent(() => onReplay?.());
  const advanceScript = useEffectEvent(() => {
    const command = advance();
    if (command) onCommand?.(command);
  });
  const completeCollapse = () => {
    if (useTaskItemStore.getState().phase !== 'collapsing') return;
    finishCollapse();
    onReplay?.();
  };
  const completeReducedCollapse = useEffectEvent(completeCollapse);

  useEffect(() => {
    reset();
    notifyReplay();
    return reset;
  }, [reset]);

  useEffect(() => {
    if (phase === 'collapsing' || phase === 'expanding') {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const timeout = window.setTimeout(
          phase === 'collapsing' ? completeReducedCollapse : finishExpand,
          0,
        );
        return () => window.clearTimeout(timeout);
      }
      return;
    }

    const delay =
      phase === 'editing'
        ? typingDelay
        : phase === 'idle'
          ? replayDelay
          : phase === 'checked'
            ? checkedDelay
            : stepDelay;
    const timeout = window.setTimeout(advanceScript, delay);
    return () => window.clearTimeout(timeout);
  }, [phase, rows, stepIndex, advance, finishCollapse, finishExpand]);

  return (
    <div
      className={`task-item${phase === 'collapsing' ? ' task-item--collapsed' : ''}`}
      aria-label={rows.filter(Boolean).join(', ')}
      onTransitionEnd={event => {
        if (
          event.target !== event.currentTarget ||
          event.propertyName !== 'width'
        ) {
          return;
        }
        if (phase === 'collapsing') {
          completeCollapse();
        }
        if (phase === 'expanding') {
          finishExpand();
        }
      }}
    >
      <div className="task-item__panel">
        <div className="task-item__content" aria-hidden="true">
          {rows.map((value, index) => (
            <div className="task-item__row" key={index}>
              <span>{value}</span>
              {phase === 'editing' && activeRow === index && (
                <span className="task-item__caret" />
              )}
            </div>
          ))}
        </div>
      </div>
      <div
        className={`task-item__indicator${activeRow === null ? ' task-item__indicator--hidden' : ''}`}
        style={{ top: `${(activeRow ?? 0) * 1.12}em` }}
      >
        <CharacterStatusIndicator
          className={phase === 'checked' ? 'is-complete' : ''}
        />
      </div>
    </div>
  );
}
