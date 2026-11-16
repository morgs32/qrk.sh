"use client";

import { useLiveQuery, useSession } from "@zerospin/react";
import { Schema } from "effect";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";

export function useUsername(): string {
  const { username: routeUsername } = useValidatedParams(Schema.Struct({ username: Schema.String }));
  const session = useSession(userSessionDefinition);
  const { data: user } = useLiveQuery({
    session,
    query: (db) => {
      const state = session.store.getState();
      if (state.initialized === null) throw new Error("Your session is not ready");
      return db.query.user.findFirst({
        where: { clerkUserId: { eq: state.initialized.claims.clerkUserId } },
      });
    },
  });
  return user?.username ?? routeUsername;
}
