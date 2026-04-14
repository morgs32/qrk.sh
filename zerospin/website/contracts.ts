import {
  createResource,
  makeContract,
  primitives,
  updateResource,
} from "zerospin";

import { LayoutItem, TextBrickContent, User } from "@/zerospin/website/models";

export const createUser = makeContract({
  commandName: "createUser",
  payload: {
    id: primitives.id({ model: User }),
    name: primitives.text(),
  },
  program: (props) => {
    const { payload } = props;
    const { id, name } = payload;
    return [
      createResource({
        model: User,
        id,
        attributes: { name },
      }),
    ];
  },
  version: "1.0.0",
});

export const updateUser = makeContract({
  commandName: "updateUser",
  payload: {
    id: primitives.id({ model: User }),
    name: primitives.text(),
  },
  program: (props) => {
    const { payload } = props;
    const { id, name } = payload;
    return [
      updateResource({
        model: User,
        id,
        attributes: { name },
      }),
    ];
  },
  version: "1.0.0",
});

export const createLayoutItem = makeContract({
  commandName: "createLayoutItem",
  payload: {
    id: primitives.id({ model: LayoutItem }),
    userId: primitives.id({ model: User }),
    gridKey: primitives.text(),
    x: primitives.integer(),
    y: primitives.integer(),
    w: primitives.integer(),
    h: primitives.integer(),
    collectionName: primitives.text(),
    variantName: primitives.text(),
  },
  program: ({ payload }) => {
    const {
      id,
      userId,
      gridKey,
      x,
      y,
      w,
      h,
      collectionName,
      variantName,
    } = payload;
    return [
      createResource({
        model: LayoutItem,
        id,
        attributes: {
          userId,
          gridKey,
          x,
          y,
          w,
          h,
          collectionName,
          variantName,
          removed: 0,
        },
      }),
    ];
  },
  version: "1.0.0",
});

export const updateLayoutItem = makeContract({
  commandName: "updateLayoutItem",
  payload: {
    id: primitives.id({ model: LayoutItem }),
    gridKey: primitives.text(),
    x: primitives.integer(),
    y: primitives.integer(),
    w: primitives.integer(),
    h: primitives.integer(),
    collectionName: primitives.text(),
    variantName: primitives.text(),
    removed: primitives.integer(),
  },
  program: ({ payload }) => {
    const {
      id,
      gridKey,
      x,
      y,
      w,
      h,
      collectionName,
      variantName,
      removed,
    } = payload;
    return [
      updateResource({
        model: LayoutItem,
        id,
        attributes: {
          gridKey,
          x,
          y,
          w,
          h,
          collectionName,
          variantName,
          removed,
        },
      }),
    ];
  },
  version: "1.0.0",
});

export const createTextBrickContent = makeContract({
  commandName: "createTextBrickContent",
  payload: {
    id: primitives.id({ model: TextBrickContent }),
    layoutItemId: primitives.id({ model: LayoutItem }),
    body: primitives.text(),
  },
  program: ({ payload }) => {
    const { id, layoutItemId, body } = payload;
    return [
      createResource({
        model: TextBrickContent,
        id,
        attributes: { layoutItemId, body },
      }),
    ];
  },
  version: "1.0.0",
});

export const updateTextBrickContent = makeContract({
  commandName: "updateTextBrickContent",
  payload: {
    id: primitives.id({ model: TextBrickContent }),
    body: primitives.text(),
  },
  program: ({ payload }) => {
    const { id, body } = payload;
    return [
      updateResource({
        model: TextBrickContent,
        id,
        attributes: { body },
      }),
    ];
  },
  version: "1.0.0",
});
