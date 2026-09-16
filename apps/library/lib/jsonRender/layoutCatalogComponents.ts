import { z } from "zod";

/** Shared layout entries for module json-render catalogs (worker-safe). */
export const layoutCatalogComponents = {
  BrickShell: {
    props: z.object({}),
    slots: ["default"],
    description:
      "Column shell for the card. Children paint top-to-bottom; typically BrickBody then BrickFooter.",
  },
  BrickBody: {
    props: z.object({}),
    slots: ["default"],
    description:
      "Scrollable flex-1 band. Last child here still sits above BrickFooter. Put content here only when it should scroll with the body, not pin to the card bottom.",
  },
  BrickFooter: {
    props: z.object({}),
    slots: ["default"],
    description:
      "Pinned bottom band (mt-auto). Put content here when the user asks for the bottom of the card. Accepts any children (identity, stats, or other leaves); not reserved for counts.",
  },
  Column: {
    props: z.object({
      gap: z.union([z.literal(2), z.literal(4)]),
      justifyContent: z
        .enum(["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"])
        .optional(),
      alignItems: z.enum(["flex-start", "flex-end", "center", "stretch", "baseline"]).optional(),
      flexWrap: z.enum(["nowrap", "wrap", "wrap-reverse"]).optional(),
    }),
    slots: ["default"],
    description:
      "Vertical flex stack. gap must be 2 or 4. Put inside BrickBody with gap 2 for lines stacked top-to-bottom.",
  },
  Row: {
    props: z.object({
      gap: z.union([z.literal(2), z.literal(4)]),
      justifyContent: z
        .enum(["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"])
        .optional(),
      alignItems: z.enum(["flex-start", "flex-end", "center", "stretch", "baseline"]).optional(),
      flexWrap: z.enum(["nowrap", "wrap", "wrap-reverse"]).optional(),
      className: z.string().optional(),
    }),
    slots: ["default"],
    description:
      'Horizontal flex cluster. gap must be 2 or 4. Put inside BrickFooter with gap 2, justifyContent "flex-end", and className "w-full" to pin counts to the right.',
  },
};
