import { createContext, type ReactNode } from "react";
import type { modulesHash } from "@qrk.sh/library/modulesHash";
import type { wallInsertionTargetSchema } from "@qrk.sh/library/wallInsertionTargetSchema";

export const WallEditorContext = createContext<{
  insertionTarget: typeof wallInsertionTargetSchema.Type | null;
  activeWallId: string | null;
  addBrick: (moduleId: keyof typeof modulesHash) => void;
  renderWall: (breakpoint: "sm" | "md" | "lg" | "xl") => ReactNode;
} | null>(null);
