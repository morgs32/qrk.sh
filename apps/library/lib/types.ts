import type { ReactNode } from "react";

import type { Catalog, Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import type { IShape } from "@zerospin/schema";

/** A library module: state document, authored component, optional json-render. */
export type IModule<MODULE extends string> = {
  /** Kebab-case module id, unique across the library. */
  id: MODULE;
  /** Zerospin model abbreviation (for example `ghp`). */
  abbreviation: string;
  label: string;
  description: string;
  catalog?: Catalog;
  registry?: ComponentRegistry;
  defaultSpec: Spec;
  def: IModuleBrickDef<MODULE>;
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
  viewFor: (breakpoint: "sm" | "md" | "lg" | "xl") => {
    component: {
      bivarianceHack(props: { state: unknown }): ReactNode;
    }["bivarianceHack"];
    spec: Spec;
    registry?: ComponentRegistry;
    w?: number;
    h?: number;
    minW?: number;
    minH?: number;
  };
  stateShape: IShape;
  defaultState: unknown;
};

/** Serializable module row: module identity, no React component. */
export type IModuleBrickDef<MODULE extends string> = {
  /** Kebab-case module slug (for example `github-profile` or `figma-thumbnail`). */
  moduleId: MODULE;
  /** Default module state or the configured state of a placed brick. */
  state: unknown;
};
