import { makeModelVersion, primitives } from "@zerospin/sdk/browser";

import { verifiedInstagramAccount } from "./verifiedInstagramAccount";

export const verifiedInstagramAccountV1 = makeModelVersion(verifiedInstagramAccount, {
  version: 1,
  attributes: {
    clerkUserId: primitives.text(),
    receivingAccountId: primitives.text(),
    senderScopedId: primitives.text(),
    username: primitives.text(),
    verifiedAt: primitives.date(),
    messageId: primitives.text(),
  },
  indexes: [
    { name: "instagram_account_clerk_user", columns: ["clerkUserId"] },
    {
      name: "receiving_account_sender",
      columns: ["receivingAccountId", "senderScopedId"],
      unique: true,
    },
  ],
});
