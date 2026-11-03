import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const avatarAndUsernameComponentMetadata = defineComponentMetadata({
  type: "AvatarAndUsername",
  propsShape: {
    avatar_url: primitives.text(),
    login: primitives.text(),
  },
  description:
    'Horizontal cluster (avatar next to @login). Bind avatar_url with { "$state": "/avatar_url" } and login with { "$state": "/login" }. Do not invent empty literals. May live in BrickBody or BrickFooter; no implied parent.',
});
