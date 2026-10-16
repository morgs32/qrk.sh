"use client";

import { makeAggregateBrowserRelease } from "@zerospin/browser";
import { makeReactApp } from "@zerospin/react";
import { PublishableKey } from "@zerospin/core/services/PublishableKey";
import { ZerospinApiUrl } from "@zerospin/core/services/ZerospinApiUrl";
import { Layer, Redacted } from "effect";
import { userSessionDefinition } from "@qrk.sh/zerospin/src/aggregates/user/userSessionDefinition";
import { signature } from "@qrk.sh/zerospin/src/signature";

const apiUrl = process.env.NEXT_PUBLIC_ZEROSPIN_API_URL;
const publishableKey = process.env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY;
if (!apiUrl) throw new Error("NEXT_PUBLIC_ZEROSPIN_API_URL is required for the app.");
if (!publishableKey)
  throw new Error("NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY is required for the app.");

export const userSessionRelease = makeAggregateBrowserRelease({
  systemName: "qrk-sh",
  aggregateName: "user",
  aggregateVersion: "2.0.0",
  actorName: "web",
  actorVersion: "2.0.0",
  sessionName: "userSession",
  claimsSchema: userSessionDefinition.claimsSchema,
  credentialsSchema: signature,
  models: userSessionDefinition.models,
  contracts: userSessionDefinition.contracts,
  layer: Layer.mergeAll(
    Layer.succeed(ZerospinApiUrl, apiUrl),
    Layer.succeed(PublishableKey, Redacted.make(publishableKey)),
  ),
});

export const UserApp = makeReactApp(userSessionRelease);
