"use client";

import {
  type ChangeEvent,
  type CompositionEvent,
  type FocusEvent,
  type KeyboardEvent,
  useLayoutEffect,
  useRef,
} from "react";

export function useTextCommit(
  commit: (value: string, signal: AbortSignal, explicit: boolean) => Promise<void> | void,
) {
  const latestCommit = useRef(commit);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = useRef<{ value: string; controller: AbortController } | null>(null);

  useLayoutEffect(() => {
    latestCommit.current = commit;
  }, [commit]);

  useLayoutEffect(
    () => () => {
      clearTimeout(timer.current);
      active.current?.controller.abort();
      active.current = null;
    },
    [],
  );

  async function commitNow(value: string, explicit: boolean) {
    clearTimeout(timer.current);
    if (active.current?.value === value) return;

    active.current?.controller.abort();
    const attempt = { value, controller: new AbortController() };
    active.current = attempt;
    try {
      await latestCommit.current(value, attempt.controller.signal, explicit);
    } finally {
      if (active.current === attempt) active.current = null;
    }
  }

  function schedule(event: ChangeEvent<HTMLInputElement> | CompositionEvent<HTMLInputElement>) {
    clearTimeout(timer.current);
    active.current?.controller.abort();
    active.current = null;
    if ("isComposing" in event.nativeEvent && event.nativeEvent.isComposing) return;
    const value = event.currentTarget.value;
    timer.current = setTimeout(() => void commitNow(value, false), 500);
  }

  return {
    schedule,
    onCompositionEnd: schedule,
    onBlur: (event: FocusEvent<HTMLInputElement>) =>
      void commitNow(event.currentTarget.value, true),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
      event.preventDefault();
      void commitNow(event.currentTarget.value, true);
    },
  };
}
