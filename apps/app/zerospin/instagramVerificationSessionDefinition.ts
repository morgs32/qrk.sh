import { makeServiceSessionDefinition } from "@zerospin/browser";
import { disconnectInstagramAccountV1 } from "@qrk.sh/zerospin/src/services/instagramVerification/contracts/disconnectInstagramAccountV1";
import { startInstagramVerificationV1 } from "@qrk.sh/zerospin/src/services/instagramVerification/contracts/startInstagramVerificationV1";
import { instagramVerificationClaimsSchema } from "@qrk.sh/zerospin/src/services/instagramVerification/instagramVerificationClaimsSchema";
import { instagramVerificationChallengeV1 } from "@qrk.sh/zerospin/src/services/instagramVerification/models/instagramVerificationChallenge/instagramVerificationChallengeV1";
import { verifiedInstagramAccountV1 } from "@qrk.sh/zerospin/src/services/instagramVerification/models/verifiedInstagramAccount/verifiedInstagramAccountV1";

export const instagramVerificationSessionDefinition = makeServiceSessionDefinition({
  systemName: "qrk-sh",
  serviceName: "instagramVerification",
  serviceVersion: 1,
  actorName: "web",
  actorVersion: 1,
  sessionName: "instagramVerificationSession",
  claimsSchema: instagramVerificationClaimsSchema,
  models: {
    instagramVerificationChallenge: instagramVerificationChallengeV1,
    verifiedInstagramAccount: verifiedInstagramAccountV1,
  },
  contracts: {
    startInstagramVerification: startInstagramVerificationV1,
    disconnectInstagramAccount: disconnectInstagramAccountV1,
  },
});
