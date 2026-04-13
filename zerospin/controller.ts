import { makeController } from "zerospin";

import {
  createLayoutItem,
  createTextTileContent,
  createUser,
  updateLayoutItem,
  updateTextTileContent,
  updateUser,
} from "@/zerospin/contracts";
import { LayoutItem, TextTileContent, User } from "@/zerospin/models";

export const qrkModels = {
  layoutItem: LayoutItem,
  textTileContent: TextTileContent,
  user: User,
};

export const qrkController = makeController({
  contracts: {
    createLayoutItem,
    createTextTileContent,
    createUser,
    updateLayoutItem,
    updateTextTileContent,
    updateUser,
  },
  name: "Qrk",
  systemName: "qrk",
  models: qrkModels,
  linked: "user",
  actor: "user",
});
