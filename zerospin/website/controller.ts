import { makeController } from "zerospin";

import {
  createLayoutItem,
  createTextTileContent,
  createUser,
  updateLayoutItem,
  updateTextTileContent,
  updateUser,
} from "@/zerospin/website/contracts";
import { LayoutItem, TextTileContent, User } from "@/zerospin/website/models";

export const websiteModels = {
  layoutItem: LayoutItem,
  textTileContent: TextTileContent,
  user: User,
};

export const websiteController = makeController({
  contracts: {
    createLayoutItem,
    createTextTileContent,
    createUser,
    updateLayoutItem,
    updateTextTileContent,
    updateUser,
  },
  name: "website",
  systemName: "qrk-sh",
  models: websiteModels,
  linked: "user",
  actor: "user",
});
