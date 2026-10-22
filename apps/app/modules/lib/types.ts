import type { IResult } from "@zerospin/error";
import type { ComponentType, ReactNode, SVGProps } from "react";

import type { Catalog, Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import type { IShape } from "@zerospin/shapes";
import type { makeModuleVersion } from "@qrk.sh/zerospin/src/modules/make/makeModuleVersion";

/** A library module: shared state and flat authored variants with optional json-render. */
export type IModule<MODULE extends string> = {
  /** Kebab-case module id, unique across the library. */
  id: MODULE;
  /** Zerospin model abbreviation (for example `ghp`). */
  abbreviation: string;
  label: string;
  description: string;
  /** Module-owned line icon; accepts native SVG sizing, styling, and accessibility props. */
  LineIcon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Maximum bricks of this module per page, including hidden and unconfigured bricks. */
  maxPerPage?: number;
  catalog?: Catalog;
  hasPlaceholder: boolean;
  Form?: (props: {
    state: unknown;
    onSave: (state: unknown) => IResult<unknown, { message: string }>;
    onCancel: () => void;
  }) => ReactNode;
  def: IModuleBrickDef<MODULE>;
  /**
   * Render boundaries supply the brick state document; components without a
   * state contract ignore the prop.
   */
  component: {
    bivarianceHack(props: { state?: unknown; spec: Spec; variantId: "default" }): ReactNode;
  }["bivarianceHack"];
  variants: {
    default: ReturnType<typeof makeModuleVersion>["variants"]["default"] & {
      component: {
        bivarianceHack(props: { state: unknown }): ReactNode;
      }["bivarianceHack"];
      /** Display-only markup for an explicitly unconfigured brick (state === null). */
      placeholder: () => ReactNode;
      spec: Spec;
      registry?: ComponentRegistry;
    };
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
