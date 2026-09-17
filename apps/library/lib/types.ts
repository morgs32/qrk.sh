import type { ReactNode } from "react";

import type { Catalog, Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import type { IShape } from "@zerospin/schema";

/** A module definition (serializable identity). */
export type IBrickDef<MODULE extends string = string> = {
  /** Kebab-case module slug (for example `icon`, `github-profile`, or `figma-thumbnail`). */
  moduleId: MODULE;
};

/** A library module: state document, authored component, optional json-render. */
export type IModule = {
  /** Kebab-case module id, unique across the library. */
  id: string;
  label: string;
  description: string;
  catalog?: Catalog;
  registry?: ComponentRegistry;
  defaultSpec: Spec;
  def: IModuleBrickDef;
  component: IModuleBrick["component"];
  stateShape: IShape;
  defaultState: unknown;
};

/** Serializable module row: module identity, no React component. */
export type IModuleBrickDef = IBrickDef & {
  /** Default module state or the configured state of a placed brick. */
  state: unknown;
};

export type IBrick<
  MODULE extends string = string,
  COMPONENT extends (props: never) => ReactNode = (props: never) => ReactNode,
> = {
  def: IBrickDef<MODULE>;
  component: COMPONENT;
};

export type IModuleBrick = {
  def: IModuleBrickDef;
  /**
   * Render boundaries supply the brick state document; components without a
   * state contract ignore the prop.
   */
  component: {
    bivarianceHack(props: {
      state?: unknown;
      spec: Spec;
      breakpoint: "sm" | "md" | "lg" | "xl";
    }): ReactNode;
  }["bivarianceHack"];
};
