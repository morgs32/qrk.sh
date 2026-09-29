"use client";

import { useUser } from "@clerk/nextjs";

/** Returns `user.username`. @throws If it is missing or empty. */
export function useUsername(): string {
  const { user } = useUser();
  const username = user?.username;
  if (username == null || username === "") {
    throw new Error("useUsername: user.username is not available");
  }
  return username;
}
