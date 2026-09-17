import type { ReactNode } from "react";

import type { Catalog, Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import type { IShape } from "@zerospin/schema";

import type { makeBreakpointOptionShape } from "../make/breakpointOptions";
import type { makeData } from "../make/makeData";
import type { makeDataFetcher } from "../make/makeDataFetcher";
import type { makeDataForm } from "../make/makeDataForm";

/** A module definition (serializable identity and dimensions). */
export type IBrickDef<MODULE extends string = string> = {
  /** Resolved initial dimensions, inheriting the nearest smaller presentation. Omitted when sized from intrinsic measure. */
  sm: { w?: number; h?: number };
  md: { w?: number; h?: number };
  lg: { w?: number; h?: number };
  xl: { w?: number; h?: number };
  /** Kebab-case module slug (for example `icon`, `github-profile`, or `figma-thumbnail`). */
  moduleId: MODULE;
};

/** A library module: data, nested breakpoints, authored component, optional json-render. */
export type IModule = {
  /** Kebab-case module id, unique across the library. */
  id: string;
  label: string;
  description: string;
  catalog?: Catalog;
  registry?: ComponentRegistry;
  breakpoints: {
    sm: {
      w?: number;
      h?: number;
      defaultSpec?: Spec;
      options?: ReturnType<typeof makeBreakpointOptionShape> & {
        form?: (props: { value: unknown; onChange: (value: unknown) => void }) => ReactNode;
      };
    };
    md: {
      w?: number;
      h?: number;
      defaultSpec?: Spec;
      options?: ReturnType<typeof makeBreakpointOptionShape> & {
        form?: (props: { value: unknown; onChange: (value: unknown) => void }) => ReactNode;
      };
    };
    lg: {
      w?: number;
      h?: number;
      defaultSpec?: Spec;
      options?: ReturnType<typeof makeBreakpointOptionShape> & {
        form?: (props: { value: unknown; onChange: (value: unknown) => void }) => ReactNode;
      };
    };
    xl: {
      w?: number;
      h?: number;
      defaultSpec?: Spec;
      options?: ReturnType<typeof makeBreakpointOptionShape> & {
        form?: (props: { value: unknown; onChange: (value: unknown) => void }) => ReactNode;
      };
    };
  };
  def: IModuleBrickDef;
  component: IModuleBrick["component"];
  stateShape: IShape;
  defaultState: unknown;
} & (
  | {
      data: null;
      dataShape: null;
      defaultData: null;
    }
  | {
      data:
        | ReturnType<typeof makeData>
        | (ReturnType<typeof makeDataForm> & {
            form?: (props: { data: unknown; onChange: (data: unknown) => void }) => ReactNode;
          })
        | (ReturnType<typeof makeDataFetcher> & {
            payloadForm?: (props: {
              value: Record<string, unknown>;
              onChange: (value: Record<string, unknown>) => void;
            }) => ReactNode;
          });
      dataShape: IShape;
      defaultData: unknown;
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
   * makeFrontend erases each module's concrete data type after checking it.
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
  }["bivarianceHack"];
};
