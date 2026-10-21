"use client";

import { useUser } from "@clerk/react";
import { type ReactNode } from "react";

export default function UserLayout(props: { children: ReactNode }) {
  const { children } = props;
  const { isLoaded, user } = useUser();
  return isLoaded && user ? children : null;
}
