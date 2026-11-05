import { makeServiceRelease } from "@zerospin/sdk";

import { instagramVerificationActorV1 } from "./actors/instagramVerificationActorV1";
import { receiveInstagramVerificationMessageV1 } from "./contracts/receiveInstagramVerificationMessageV1";
import { resolveInstagramVerificationSenderV1 } from "./contracts/resolveInstagramVerificationSenderV1";
import { instagramVerification } from "./instagramVerification";
import { instagramVerificationChallengeV1 } from "./models/instagramVerificationChallenge/instagramVerificationChallengeV1";
import { verifiedInstagramAccountV1 } from "./models/verifiedInstagramAccount/verifiedInstagramAccountV1";

export const instagramVerificationV1 = makeServiceRelease(instagramVerification, {
  version: 1,
  models: {
    instagramVerificationChallenge: instagramVerificationChallengeV1,
    verifiedInstagramAccount: verifiedInstagramAccountV1,
  },
  actors: { web: instagramVerificationActorV1 },
  system: { receiveInstagramVerificationMessage: receiveInstagramVerificationMessageV1 },
  external: { resolveInstagramVerificationSender: resolveInstagramVerificationSenderV1 },
});
