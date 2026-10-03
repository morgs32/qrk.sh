import './string-replace.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useState,
  type Ref,
} from 'react';

import { useStore } from 'zustand';

import { createStringReplaceStore } from './string-replace-store';

export type StringReplaceHandle = {
  replaceWith: (text: string) => void;
  reset: () => void;
};

export default function StringReplace({
  initialText,
  letterDelay = 48,
  onComplete,
  ref,
}: {
  initialText: string;
  letterDelay?: number;
  onComplete?: (text: string) => void;
  ref?: Ref<StringReplaceHandle>;
}) {
  const [store] = useState(() => createStringReplaceStore(initialText));
  const { text, changedIndex, frameNumber, requestId, frames } =
    useStore(store);
  const complete = useEffectEvent((value: string) => onComplete?.(value));
  useImperativeHandle(
    ref,
    () => ({
      replaceWith: next => {
        const completed = store.getState().replaceWith(next);
        if (completed !== undefined) onComplete?.(completed);
      },
      reset: store.getState().reset,
    }),
    [store, onComplete],
  );

  useEffect(() => {
    if (frames.length === 0) return;
    const timeout = window.setTimeout(() => {
      const completed = store.getState().advance(requestId);
      if (completed !== undefined) complete(completed);
    }, letterDelay);
    return () => window.clearTimeout(timeout);
  }, [store, requestId, frames, letterDelay]);

  const methodStart = text.indexOf('.') + 1;
  const methodEnd = text.indexOf('(');

  return (
    <span className="string-replace" role="img" aria-label={text}>
      <span aria-hidden="true">
        {Array.from(text, (letter, index) => {
          const color =
            index >= methodStart && index < methodEnd
              ? 'method'
              : /\d/.test(letter)
                ? 'number'
                : 'plain';
          const animated = index === changedIndex;
          return (
            <span
              className={`string-replace__${color}${animated ? ' string-replace__changed' : ''}`}
              key={animated ? `edit-${frameNumber}` : index}
            >
              {letter}
            </span>
          );
        })}
      </span>
    </span>
  );
}
