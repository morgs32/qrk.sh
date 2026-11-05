import { makeSystem } from "@zerospin/sdk";
import { userAggregateV9 } from "./aggregates/user/UserV9";
import { instagramVerificationV1 } from "./services/instagramVerification/instagramVerificationV1";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: {
    user: {
      releases: { 9: userAggregateV9 },
      canonical: 9,
    },
  },
  services: {
    instagramVerification: {
      releases: { 1: instagramVerificationV1 },
      canonical: 1,
    },
  },
});
