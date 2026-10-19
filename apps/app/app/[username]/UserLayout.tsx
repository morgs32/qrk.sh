"use client";

import { useUser } from "@clerk/react";
import { Suspense, type ReactNode } from "react";
import { UserApp } from "@/zerospin/userSession";

export default function UserLayout(props: { children: ReactNode }) {
  const { children } = props;
  const { isLoaded, user } = useUser();
  return isLoaded && user ? (
    <Suspense fallback={null}>
      <InitializedUserContent>{children}</InitializedUserContent>
    </Suspense>
  ) : null;
}

function InitializedUserContent(props: { children: ReactNode }) {
  const { children } = props;
  UserApp.useInitializedSession();
  return children;
}
