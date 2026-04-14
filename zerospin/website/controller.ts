import { makeController } from "zerospin";

import {
  createLayoutItem,
  createTextBrickContent,
  createUser,
  updateLayoutItem,
  updateTextBrickContent,
  updateUser,
} from "@/zerospin/website/contracts";
import { LayoutItem, TextBrickContent, User } from "@/zerospin/website/models";

export const websiteModels = {
  layoutItem: LayoutItem,
  textBrickContent: TextBrickContent,
  user: User,
};

export const websiteController = makeController({
  contracts: {
    createLayoutItem,
    createTextBrickContent,
    createUser,
    updateLayoutItem,
    updateTextBrickContent,
    updateUser,
  },
  name: "website",
  systemName: "qrk-sh",
  models: websiteModels,
  linked: "user",
  actor: "user",
});
