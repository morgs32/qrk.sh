import type { IResult } from "@zerospin/error";
import type { ComponentType, ReactNode, SVGProps } from "react";

import type { Catalog, Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import type { IShape } from "@zerospin/shapes";

/** A library module: state document, authored component, optional json-render. */
export type IModule<MODULE extends string> = {
  /** Kebab-case module id, unique across the library. */
  id: MODULE;
  /** Zerospin model abbreviation (for example `ghp`). */
  abbreviation: string;
  label: string;
  description: string;
  /** Module-owned line icon; accepts native SVG sizing, styling, and accessibility props. */
  LineIcon: ComponentType<SVGProps<SVGSVGElement>>;
  configureCommand?:
    | "configureInstagram"
    | "configureGithubActivity"
    | "configureGithubProfile"
    | "configureGithubRepo"
    | "configureFigmaThumbnail"
    | "configureLink"
    | "configureMapPlace";
  /** Maximum bricks of this module per page, including hidden and unconfigured bricks. */
  maxPerPage?: number;
  catalog?: Catalog;
  registry?: ComponentRegistry;
  defaultSpec: Spec;
  hasPlaceholder: boolean;
  /** Required display-only markup for an explicitly unconfigured brick (state === null). */
  placeholder: () => ReactNode;
  Form?: (props: {
    state: unknown;
    onConfigure: (input: unknown) => IResult<unknown, { message: string }>;
    onSave: (state: unknown) => IResult<unknown, { message: string }>;
    onCancel: () => void;
  }) => ReactNode;
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
    /** Preferred preview width in pixels, after applying the breakpoint override. */
    defaultWidth: number;
    /** Minimum rendered width in pixels, shared by every breakpoint. */
    minWidth: 160 | 320;
    component: {
      bivarianceHack(props: { state: unknown }): ReactNode;
    }["bivarianceHack"];
    spec: Spec;
    registry?: ComponentRegistry;
  };
  stateShape: IShape;
  defaultState: unknown;
};

/** Serializable module row: module identity, no React component. */
export type IModuleBrickDef<MODULE extends string> = {
  /** Kebab-case module slug (for example `github-profile` or `figma-thumbnail`). */
  moduleId: MODULE;
  /** Default or configured state; null for an opted-in, unconfigured placed brick. */
  state: unknown;
};
