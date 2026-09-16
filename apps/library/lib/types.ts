import type { ReactNode } from "react";

import type { Catalog, Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import type { IShape } from "@zerospin/schema";

import type { makeBreakpointOptions } from "../make/makeBreakpointOptions";
import type { IFetcherConfiguration } from "../make/makeFetcherConfiguration";
import type { IFormConfiguration } from "../make/makeFormConfiguration";

/** A module definition (serializable identity and dimensions). */
export type IBrickDef<MODULE extends string = string> = {
  /** Resolved initial dimensions, inheriting the nearest smaller presentation. */
  sm: { w: number; h: number };
  md: { w: number; h: number };
  lg: { w: number; h: number };
  xl: { w: number; h: number };
  /** Kebab-case module slug (for example `icon`, `github-profile`, or `figma-thumbnail`). */
  moduleId: MODULE;
};

/** A library module: data, configuration, and one responsive presentation. */
export type IModule = {
  /** Kebab-case module id, unique across the library. */
  id: string;
  label: string;
  description: string;
  /**
   * When true, library module-list previews may grow to intrinsic content size.
   * When false, previews use the declared breakpoint grid size only.
   */
  measurable: boolean;
  catalog: Catalog;
  defaultSpec: Spec;
  registry: ComponentRegistry;
} & (
  | {
      configuration: null;
      dataShape: null;
      defaultData: null;
      def: IModuleBrickDef;
      component: IModuleBrick["component"];
    }
  | {
      configuration: null | IFormConfiguration | IFetcherConfiguration;
      dataShape: IShape;
      defaultData: unknown;
      def: IModuleBrickDef;
      component: IModuleBrick["component"];
    }
);

/** Serializable module row: module identity, no React component. */
export type IModuleBrickDef = IBrickDef & {
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
      breakpointOptions?: unknown;
      spec?: Spec;
      breakpoint: "sm" | "md" | "lg" | "xl";
    }): ReactNode;
  }["bivarianceHack"] & { breakpointOptions?: ReturnType<typeof makeBreakpointOptions> };
};
