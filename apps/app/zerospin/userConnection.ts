"use client";

import { makeApplicationSharedWorker } from "@zerospin/browser/makeApplicationSharedWorker";

import { PublishableKey } from "@zerospin/core/services/PublishableKey";
import { ZerospinApiUrl } from "@zerospin/core/services/ZerospinApiUrl";
import { Layer, Redacted } from "effect";
import { signature } from "@qrk.sh/zerospin/src/signature";
import workerUrl from "./node.worker?sharedworker&url";

const apiUrl = process.env.NEXT_PUBLIC_ZEROSPIN_API_URL;
const publishableKey = process.env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY;
if (!apiUrl) throw new Error("NEXT_PUBLIC_ZEROSPIN_API_URL is required for the app.");
if (!publishableKey)
  throw new Error("NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY is required for the app.");

export const userConnection = Object.freeze({
  sessionType: "aggregate",
  credentialsSchema: signature,
  sharedWorker: (props: { name: string }) => {
    const { ...workerProps } = props;
    return makeApplicationSharedWorker(workerUrl, workerProps);
  },
  layer: Layer.mergeAll(
    Layer.succeed(ZerospinApiUrl, apiUrl),
    Layer.succeed(PublishableKey, Redacted.make(publishableKey)),
  ),
});
