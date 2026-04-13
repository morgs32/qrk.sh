import { makeBackend, makeSystem } from "zerospin";

import {
  createLayoutItem,
  createTextTileContent,
  createUser,
  updateLayoutItem,
  updateTextTileContent,
  updateUser,
} from "@/zerospin/contracts";
import { qrkController } from "@/zerospin/controller";
import { LayoutItem, TextTileContent, User } from "@/zerospin/models";

export const backend = makeBackend({
  controller: qrkController,
  getGraph: (props) => {
    const { actorId, db } = props;
    return db.query.user
      .findFirst({
        where: { id: { eq: actorId } },
        with: {
          layoutItems: {
            with: {
              textContent: true,
            },
          },
        },
      })
      .sync();
  },
});

export const system = makeSystem({
  controllers: {
    Qrk: qrkController,
  },
  backends: {
    Qrk: backend,
  },
  contracts: {
    createLayoutItem,
    createTextTileContent,
    createUser,
    updateLayoutItem,
    updateTextTileContent,
    updateUser,
  },
  models: {
    layoutItem: LayoutItem,
    textTileContent: TextTileContent,
    user: User,
  },
  actor: "user",
  id: "qrkSys_v1_7KpQmN2xRt4YwZ8",
  version: "1.0.0",
});
