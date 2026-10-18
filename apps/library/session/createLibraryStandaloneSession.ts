import { makeApplicationSharedWorker } from "@zerospin/browser/makeApplicationSharedWorker";
import { RoutePattern } from "@remix-run/route-pattern";
import { createContext, useContext } from "react";

import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from "@zerospin/core/aggregateSession/types";
import { makeBrowserSession, makeStandaloneSessionDefinition } from "@zerospin/browser";
import type { IBrowserSession } from "@zerospin/browser/makeBrowserSession/types";

import { libraryModule } from "../libraryModule/libraryModule";
import { librarySessionDefinition } from "./librarySessionDefinition";

const fixtureDate = new Date("2026-01-01T00:00:00.000Z");

// Webpack recognizes this local method as the application worker entrypoint.
const applicationWorker = { create: makeApplicationSharedWorker };

export const libraryBrowserDefinition = makeStandaloneSessionDefinition({
  sessionDefinition: librarySessionDefinition,
  sharedWorker: (props) =>
    applicationWorker.create(new URL("./librarySession.worker.ts", import.meta.url), props),
});

export function createLibraryStandaloneSession(props: {
  key: string;
  wallId: `wal_${string}`;
}): IBrowserSession<typeof libraryBrowserDefinition> {
  const { key, wallId } = props;
  return makeBrowserSession({
    sessionDefinition: libraryBrowserDefinition,
    backupPath: RoutePattern.parse("/" + encodeURIComponent(key) + "-command-query-v1"),
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

export type ILibrarySession = IAggregateSession<
  IAggregateSessionDefinition<
    string,
    string,
    string,
    typeof libraryModule.contracts,
    typeof libraryModule.models
  >,
  never
>;

export const LibrarySessionContext = createContext<ILibrarySession | null>(null);

export function useLibrarySession() {
  const session = useContext(LibrarySessionContext);
  if (session === null) throw new Error("useLibrarySession requires LibrarySessionContext");
  return session;
}
