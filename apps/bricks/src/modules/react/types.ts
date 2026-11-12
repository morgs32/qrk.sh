import type { IResult } from "@zerospin/error";
import type { ComponentType, ReactNode, SVGProps } from "react";

import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import type { IShape } from "@zerospin/shapes";
import type { makeModuleVersion } from "../../definition/makeModuleVersion";
import type { categories } from "./categories";

/** A library module with shared state and JSON Render variants. */
export type IModule<MODULE extends string> = {
  /** Kebab-case module id, unique across the library. */
  id: MODULE;
  /** Zerospin model abbreviation (for example `ghp`). */
  abbreviation: string;
  label: string;
  description: string;
  categoryIds: readonly (typeof categories)[number]["id"][];
  /** Module-owned line icon; accepts native SVG sizing, styling, and accessibility props. */
  LineIcon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Maximum bricks of this module per page, including hidden and unconfigured bricks. */
  maxPerPage?: number;
  hasPlaceholder: boolean;
  InlineEditor?: (props: {
    state: unknown;
    onSave: (state: unknown) => IResult<unknown, { message: string }>;
    registerFlush: (flush: (onRecover?: () => void) => boolean) => () => void;
  }) => ReactNode;
  Form?: (props: {
    state: unknown;
    onSave: (state: unknown) => IResult<unknown, { message: string }>;
    onDraftChange?: (draft: { state: unknown; pending: boolean; valid: boolean }) => void;
    previewWidth?: number;
    measureFrame?: (selector: string) => number | undefined;
  }) => ReactNode;
  def: IModuleBrickDef<MODULE>;
  Render: (props: { state: unknown; spec: Spec; variantId: "default" }) => ReactNode;
  variants: {
    default: ReturnType<typeof makeModuleVersion>["variants"]["default"] & {
      /** Display-only markup for an explicitly unconfigured brick (state === null). */
      placeholder?: () => ReactNode;
      preview?: (props: {
        state: unknown;
        setState: (state: unknown) => void;
        isActive: boolean;
        children: ReactNode;
      }) => ReactNode;
      spec: Spec;
      registry: ComponentRegistry;
    };
  };
  stateShape: IShape;
  defaultState: unknown;
  /** Optional sample states for specific starting layouts. */
  previewStates?: Record<string, unknown>;
  /** Initial configuration, or "preview" to capture the selected preview state. */
  initialDraft: unknown;
};

/** Serializable module row: module identity, no React component. */
export type IModuleBrickDef<MODULE extends string> = {
  /** Kebab-case module slug (for example `github-profile` or `figma-thumbnail`). */
  moduleId: MODULE;
  /** Default or configured state; null for an opted-in, unconfigured placed brick. */
  state: unknown;
};
