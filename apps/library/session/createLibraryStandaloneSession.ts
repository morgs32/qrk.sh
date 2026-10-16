import type { Layer } from "effect";
import { RoutePattern } from "@remix-run/route-pattern";
import { createContext, useContext } from "react";

import type {
  IAggregateSession,
  IAggregateSessionRelease,
} from "@zerospin/core/aggregateSession/types";
import { makeBrowserSession, makeStandaloneSessionRelease } from "@zerospin/browser";
import type { IBrowserSession } from "@zerospin/browser/makeBrowserSession/types";

import { libraryModule } from "../libraryModule/libraryModule";
import { librarySessionDeclaration } from "./librarySessionDeclaration";

const fixtureDate = new Date("2026-01-01T00:00:00.000Z");

export const librarySessionRelease: IAggregateSessionRelease<
  "standalone",
  "library",
  "library",
  typeof libraryModule.contracts,
  typeof libraryModule.models,
  "1.0.0",
  typeof librarySessionDeclaration.claimsSchema
> & {
  actorName: "library";
  actorVersion: "1.0.0";
  sessionType: "standalone";
  layer: Layer.Layer<never> | undefined;
  sharedWorker: (props: { name: string }) => SharedWorker;
} = makeStandaloneSessionRelease({
  ...librarySessionDeclaration,
  sharedWorker: (props) => {
    const { name } = props;
    return new SharedWorker(new URL("./librarySession.worker.ts", import.meta.url), {
      type: "module",
      name,
    });
  },
});

export function createLibraryStandaloneSession(props: {
  key: string;
  wallId: `wal_${string}`;
}): IBrowserSession<typeof librarySessionRelease> {
  const { key, wallId } = props;
  return makeBrowserSession({
    sessionRelease: librarySessionRelease,
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
  IAggregateSessionRelease<
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
