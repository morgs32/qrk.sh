"use client";

import type { ReactNode } from "react";

import { prefixId } from "@zerospin/core/models/prefixId";
import { ZerospinMockProvider } from "@zerospin/react/ZerospinMockProvider";

import {
  LibraryFrontend,
  sessionRuntimeLayer,
} from "../aggregates/library/libraryFrontend";

export const SANDBOX_WALL_ID = prefixId(LibraryFrontend.models.wall, "sandbox");

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
            modelName: LibraryFrontend.models.wall.modelName,
            updatedAt: fixtureDate,
            version: LibraryFrontend.models.wall.version,
          },
        ],
      }}
    >
      {children}
    </ZerospinMockProvider>
  );
}
