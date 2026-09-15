import type { ReactNode } from "react";

import type { IShape } from "@zerospin/schema";

import type { makeAppearanceForm } from "./makeAppearanceForm";
import type { IFetcherConfiguration } from "./makeFetcherConfiguration";
import type { IFormConfiguration } from "./makeFormConfiguration";

/** A module definition (serializable identity and dimensions). */
export type IBrickDef<MODULE extends string = string> = {
  /** Resolved initial dimensions, inheriting the nearest smaller presentation. */
  xs: { w: number; h: number };
  sm: { w: number; h: number };
  lg: { w: number; h: number };
  xl: { w: number; h: number };
  /** Kebab-case module slug (for example `icon`, `github-profile`, or `figma-thumbnail`). */
  moduleId: MODULE;
  /** Display label for this module. */
  label: string;
  /** Lower sorts earlier in the drawer. */
  order: number;
};

/** A library module: data, configuration, and one responsive presentation. */
export type IModule = {
  /** Kebab-case module id, unique across the library. */
  id: string;
  label: string;
  description: string;
} & (
  | {
      configuration?: never;
      dataShape: null;
      defaultData: null;
      def: IModuleBrickDef;
      component: IModuleBrick["component"];
    }
  | {
      configuration?: IFormConfiguration | IFetcherConfiguration;
      dataShape: IShape;
      defaultData: unknown;
      def: IModuleBrickDef;
      component: IModuleBrick["component"];
    }
);

/** Serializable module row: module identity, no React component. */
export type IModuleBrickDef = IBrickDef & {
  moduleLabel: string;
  /** Default module data or the configured data of a placed brick. */
  data: unknown;
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
   * makeModule erases each module's concrete data type after checking it.
   * Render boundaries can supply defaultData directly; components without a
   * data contract ignore the prop.
   */
  component: {
    bivarianceHack(props: {
      data?: unknown;
      appearanceOptions?: unknown;
      breakpoint: "xs" | "sm" | "lg" | "xl";
    }): ReactNode;
  }["bivarianceHack"] & { form?: ReturnType<typeof makeAppearanceForm> };
};
