import { createContext } from "react";
import type { JSONContent } from "@tiptap/react";
import type { UploadFunction } from "./tiptap/node/image-upload-node/image-upload-node-extension";

/** Only placed Text bricks receive editing and geometry capabilities. */
export const TextBrickEditingContext = createContext<{
  isEditing: boolean;
  isActive: boolean;
  measurementEpoch: string;
  activate: () => void;
  deactivate: () => void;
  onDocumentChange: (document: JSONContent) => boolean;
  onNaturalHeight: (height: number) => void;
  uploadImage: UploadFunction;
  onError: (message: string) => void;
} | null>(null);
