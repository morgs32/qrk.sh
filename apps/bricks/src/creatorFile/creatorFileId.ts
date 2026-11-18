import { Schema } from "effect";

export const creatorFileIdSchema = Schema.TemplateLiteral(["ast_", Schema.String]).check(
  Schema.makeFilter(
    (value) => /^ast_[A-Za-z0-9_-]+$/.test(value) || "Expected a managed creator file ID",
  ),
);

export const isCreatorFileId = Schema.is(creatorFileIdSchema);

export const creatorImageSourceSchema = Schema.String.check(
  Schema.makeFilter((value) => {
    if (isCreatorFileId(value)) return true;
    const url = URL.parse(value);
    return url?.protocol === "http:" || url?.protocol === "https:" ||
      "Expected a managed creator file ID or an HTTP(S) URL";
  }),
);

export function makeCreatorFileUrl(fileId: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (typeof base !== "string" || base.length === 0) {
    throw new Error("NEXT_PUBLIC_API_URL is required");
  }
  return `${base.replace(/\/$/, "")}/files/${fileId}`;
}
