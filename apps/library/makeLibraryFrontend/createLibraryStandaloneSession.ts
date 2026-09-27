import type { IAggregateSession } from "@zerospin/core/aggregateSession/types";
import { createContext, useContext } from "react";

import { makeStandaloneSession } from "@zerospin/browser";

import { LibraryFrontend } from "./makeLibraryFrontend";

const fixtureDate = new Date("2026-01-01T00:00:00.000Z");

export function createLibraryStandaloneSession(props: { key: string; wallId: `wal_${string}` }) {
  const { key, wallId } = props;
  return makeStandaloneSession({
    key,
    ...LibraryFrontend,
    identitySchema: LibraryFrontend.identity.identitySchema,
    identity: { aggregateId: "acct_1" },
    resources: {
      wall: [
        {
          createdAt: fixtureDate,
          id: wallId,
          label: "Library",
          modelName: LibraryFrontend.models.wall.modelName,
          updatedAt: fixtureDate,
          version: LibraryFrontend.models.wall.version,
        },
      ],
    },
  });
}

export type ILibrarySession = IAggregateSession<typeof LibraryFrontend & { systemName: string }>;

export const LibrarySessionContext = createContext<ILibrarySession | null>(null);

export function useLibrarySession() {
  const session = useContext(LibrarySessionContext);
  if (session === null) {
    throw new Error("useLibrarySession requires LibrarySessionContext");
  }
  return session;
}
