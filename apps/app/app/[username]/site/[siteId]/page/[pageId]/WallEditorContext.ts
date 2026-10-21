import { createContext, type ReactNode } from "react";
import type { modulesHash } from "../../../../../../modules/lib/modulesHash";
import type { wallInsertionTargetSchema } from "../../../../../../modules/lib/wall/wallInsertionTargetSchema";

export const WallEditorContext = createContext<{
  insertionTarget: typeof wallInsertionTargetSchema.Type | null;
  activeWallId: string | null;
  addBrick: (moduleId: keyof typeof modulesHash) => void;
  renderWall: (breakpoint: "sm" | "md" | "lg" | "xl") => ReactNode;
} | null>(null);
