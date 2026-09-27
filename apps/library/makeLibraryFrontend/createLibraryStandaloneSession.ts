import { createContext, useContext } from "react";

import { makeStandaloneSession } from "@zerospin/react";

import { LibraryFrontend, libraryRuntime } from "./makeLibraryFrontend";

const fixtureDate = new Date("2026-01-01T00:00:00.000Z");

export function createLibraryStandaloneSession(props: { key: string; wallId: `wal_${string}` }) {
  const { key, wallId } = props;
  return makeStandaloneSession({
    key,
    frontend: LibraryFrontend,
    runtime: libraryRuntime,
    authentication: { aggregateId: "acct_1" },
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

export type ILibraryStandaloneSession = ReturnType<typeof createLibraryStandaloneSession>;

export const LibrarySessionContext = createContext<ILibraryStandaloneSession | null>(null);

export function useLibrarySession() {
  const session = useContext(LibrarySessionContext);
  if (session === null) {
    throw new Error("useLibrarySession requires LibrarySessionContext");
  }
  return session;
}
