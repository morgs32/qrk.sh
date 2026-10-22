"use client";

import { PublishableKey } from "@zerospin/core/services/PublishableKey";
import { ZerospinApiUrl } from "@zerospin/core/services/ZerospinApiUrl";
import { Layer, Redacted } from "effect";

const apiUrl = process.env.NEXT_PUBLIC_ZEROSPIN_API_URL;
const publishableKey = process.env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY;
if (!apiUrl) throw new Error("NEXT_PUBLIC_ZEROSPIN_API_URL is required for the app.");
if (!publishableKey)
  throw new Error("NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY is required for the app.");

export const userApplicationLayer = Layer.mergeAll(
  Layer.succeed(ZerospinApiUrl, apiUrl),
  Layer.succeed(PublishableKey, Redacted.make(publishableKey)),
);
