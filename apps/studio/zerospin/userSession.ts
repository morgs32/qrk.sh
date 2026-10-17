"use client";

import { makeApplicationSharedWorker } from "@zerospin/browser/makeApplicationSharedWorker";

import { makeAggregateBrowserRelease } from "@zerospin/browser";
import { makeReactApp } from "@zerospin/react";
import { PublishableKey } from "@zerospin/core/services/PublishableKey";
import { ZerospinApiUrl } from "@zerospin/core/services/ZerospinApiUrl";
import { Layer, Redacted } from "effect";
import { signature } from "@qrk.sh/zerospin/src/signature";
import { userSessionDeclaration } from "./userSessionDeclaration";

const apiUrl = process.env.NEXT_PUBLIC_ZEROSPIN_API_URL;
const publishableKey = process.env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY;
if (!apiUrl) throw new Error("NEXT_PUBLIC_ZEROSPIN_API_URL is required for the app.");
if (!publishableKey)
  throw new Error("NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY is required for the app.");

// Webpack recognizes this local method as the application worker entrypoint.
const applicationWorker = { create: makeApplicationSharedWorker };

export const userSessionRelease = makeAggregateBrowserRelease({
  sessionRelease: userSessionDeclaration,
  credentialsSchema: signature,
  sharedWorker: (props) =>
    applicationWorker.create(new URL("./node.worker.ts", import.meta.url), props),
  layer: Layer.mergeAll(
    Layer.succeed(ZerospinApiUrl, apiUrl),
    Layer.succeed(PublishableKey, Redacted.make(publishableKey)),
  ),
});

export const UserApp = makeReactApp(userSessionRelease);
