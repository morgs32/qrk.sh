import { createContext, useContext } from "react";

import { makeStandaloneSession } from "@zerospin/browser";
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from "@zerospin/core/aggregateSession/types";

import { LibraryFrontend } from "./makeLibraryFrontend";

const fixtureDate = new Date("2026-01-01T00:00:00.000Z");

export function createLibraryStandaloneSession(props: { key: string; wallId: `wal_${string}` }) {
  const { key, wallId } = props;
  return makeStandaloneSession({
    key,
    ...LibraryFrontend,
    claimsSchema: LibraryFrontend.claimsSchema,
    claims: { aggregateId: "acct_1" },
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

export type ILibrarySession = IAggregateSession<
  IAggregateSessionDefinition<
    "mock" | "standalone",
    typeof LibraryFrontend.aggregateName,
    typeof LibraryFrontend.sessionName,
    typeof LibraryFrontend.contracts,
    typeof LibraryFrontend.models,
    typeof LibraryFrontend.aggregateVersion,
    typeof LibraryFrontend.claimsSchema
  >
>;

export const LibrarySessionContext = createContext<ILibrarySession | null>(null);

export function useLibrarySession() {
  const session = useContext(LibrarySessionContext);
  if (session === null) {
    throw new Error("useLibrarySession requires LibrarySessionContext");
  }
  return session;
}
