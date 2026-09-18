"use client";

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { wallModelV1 } from "../aggregates/library/models/wall/wallModelV1";
import { MockLibraryProvider } from "../aggregates/library/libraryFrontend";
import { sandboxWallId } from "../aggregates/library/sandboxWallId";

export const SANDBOX_WALL_ID = sandboxWallId;

const fixtureDate = new Date("2026-01-01T00:00:00.000Z");

const SandboxChildrenContext = createContext<ReactNode>(null);

function SandboxChildrenOutlet() {
  return useContext(SandboxChildrenContext);
}

function subscribeToNothing() {
  return () => {};
}

export function LibrarySandboxProvider(props: {
  children: ReactNode;
  sessionKey: number | string;
}) {
  const { children, sessionKey } = props;
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  // makeMockProvider keys SWR on a ref of its props; hashing React children
  // (and SSR) blows up. Mount only on the client and pass a prop-less outlet
  // so the SWR key stays small — children arrive via context instead.
  if (!mounted) {
    return null;
  }

  return (
    <SandboxChildrenContext value={children}>
      <MockLibraryProvider
        key={sessionKey}
        authentication={{ aggregateId: "acct_1" }}
        resources={{
          wall: [
            {
              createdAt: fixtureDate,
              id: SANDBOX_WALL_ID,
              label: "Sandbox",
              modelName: wallModelV1.modelName,
              updatedAt: fixtureDate,
              version: wallModelV1.version,
            },
          ],
        }}
      >
        <SandboxChildrenOutlet />
      </MockLibraryProvider>
    </SandboxChildrenContext>
  );
}
