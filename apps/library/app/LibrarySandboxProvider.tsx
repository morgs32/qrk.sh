"use client";

import type { ReactNode } from "react";

import { ZerospinMockProvider } from "@zerospin/react/ZerospinMockProvider";

import {
  LibraryFrontend,
  sessionRuntimeLayer,
} from "../aggregates/library/libraryFrontend";
import { wallModelV1 } from "../aggregates/library/models/wall/wallModelV1";
import { sandboxWallId } from "../aggregates/library/sandboxWallId";

export const SANDBOX_WALL_ID = sandboxWallId;

const fixtureDate = new Date("2026-01-01T00:00:00.000Z");

export function LibrarySandboxProvider(props: {
  children: ReactNode;
  sessionKey: number | string;
}) {
  const { children, sessionKey } = props;

  return (
    <ZerospinMockProvider
      key={sessionKey}
      frontend={LibraryFrontend}
      layer={sessionRuntimeLayer}
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
      {children}
    </ZerospinMockProvider>
  );
}
