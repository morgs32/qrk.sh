import { useEffect, useRef, useState } from 'react';

import { holdDelay, stringScript } from './script';
import StringReplace, { type StringReplaceHandle } from './StringReplace';

export function HeroHeadline() {
  const headline = useRef<StringReplaceHandle>(null);
  const index = useRef(0);
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      index.current = (index.current + 1) % stringScript.length;
      headline.current?.replaceWith(stringScript[index.current]);
    }, holdDelay);
    return () => window.clearTimeout(timeout);
  }, [completed]);

  return (
    <StringReplace
      ref={headline}
      initialText={stringScript[0]}
      onComplete={() => setCompleted(value => value + 1)}
    />
  );
}
