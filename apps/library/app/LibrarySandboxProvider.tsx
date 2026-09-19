"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { prefixId } from "@zerospin/core/models/prefixId";
import {
  makeMockSession,
  useInitializeMockSession,
} from "@zerospin/react";

import {
  LibraryFrontend,
  libraryRuntime,
} from "../aggregates/library/libraryFrontend";

export const SANDBOX_WALL_ID = prefixId(LibraryFrontend.models.wall, "sandbox");

const fixtureDate = new Date("2026-01-01T00:00:00.000Z");

function createLibraryMockSession() {
  return makeMockSession({
    frontend: LibraryFrontend,
    runtime: libraryRuntime,
    authentication: { aggregateId: "acct_1" },
    resources: {
      wall: [
        {
          createdAt: fixtureDate,
          id: SANDBOX_WALL_ID,
          label: "Sandbox",
          modelName: LibraryFrontend.models.wall.modelName,
          updatedAt: fixtureDate,
          version: LibraryFrontend.models.wall.version,
        },
      ],
    },
  });
}

const LibrarySessionContext = createContext<ReturnType<
  typeof createLibraryMockSession
> | null>(null);

export function useLibrarySession() {
  const session = useContext(LibrarySessionContext);
  if (session === null) {
    throw new Error("useLibrarySession must be used within LibrarySandboxProvider");
  }
  return session;
}

export function LibrarySandboxProvider(props: {
  children: ReactNode;
  sessionKey: number | string;
}) {
  const { children, sessionKey } = props;

  const session = useMemo(
    () => createLibraryMockSession(),
    // Remount via sessionKey on the parent; recreate when the key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionKey is the reset signal
    [sessionKey],
  );

  const { isInitialized } = useInitializeMockSession({ session });
  if (!isInitialized) {
    return null;
  }

  return (
    <LibrarySessionContext.Provider value={session}>
      {children}
    </LibrarySessionContext.Provider>
  );
}
