"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { userSession } from "@/zerospin/userSession";

export default function UserLayout(props: { children: ReactNode }) {
  const { children } = props;
  const isInitialized = useSyncExternalStore(
    userSession.store.subscribe,
    () => userSession.store.getState().isInitialized,
    () => false,
  );
  return isInitialized ? children : null;
}
