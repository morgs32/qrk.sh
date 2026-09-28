import { Schema } from "effect";
import { createContext, useContext } from "react";

import { makeStandaloneSession } from "@zerospin/browser";

import { libraryModule } from "../libraryModule/libraryModule";

const fixtureDate = new Date("2026-01-01T00:00:00.000Z");

export function createLibraryStandaloneSession(props: { key: string; wallId: `wal_${string}` }) {
  const { key, wallId } = props;
  return makeStandaloneSession({
    key,
    ...libraryModule,
    kind: "aggregate",
    aggregateName: "library",
    aggregateVersion: "1.0.0",
    actorName: "library",
    actorVersion: "1.0.0",
    sessionName: "library",
    claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
    claims: { aggregateId: "acct_1" },
    resources: {
      wall: [
        {
          createdAt: fixtureDate,
          id: wallId,
          label: "Library",
          modelName: libraryModule.models.wall.modelName,
          updatedAt: fixtureDate,
          version: libraryModule.models.wall.version,
        },
      ],
    },
  });
}

export type ILibrarySession = ReturnType<typeof createLibraryStandaloneSession>;

export const LibrarySessionContext = createContext<ILibrarySession | null>(null);

export function useLibrarySession() {
  const session = useContext(LibrarySessionContext);
  if (session === null) {
    throw new Error("useLibrarySession requires LibrarySessionContext");
  }
  return session;
}
