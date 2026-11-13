import { gfmBlockOnlyParser, isSpaceChar, LEZER_NODE_IDS } from "@meowdown/markdown";
import type { Node } from "@prosekit/pm/model";

/** One visible text block, including a paragraph wrapped in a blockquote. */
export function isTextDocument(doc: Node) {
  if (doc.childCount !== 1) return false;
  const root = doc.firstChild;
  if (root === null) return false;
  const block = root.type.name === "blockquote" && root.childCount === 1 ? root.firstChild : root;
  if (block === null || (block.type.name !== "paragraph" && block.type.name !== "heading")) return false;
  if (root.type.name === "blockquote" && block.type.name !== "paragraph") return false;
  if (block.type.name === "heading" && ![1, 2, 3].includes(block.attrs.level)) return false;
  let valid = true;
  block.forEach((node) => {
    if (!node.isText || /[\r\n\u2028\u2029]/u.test(node.text ?? "")) valid = false;
  });
  return valid;
}

export function isTextMarkdown(markdown: string) {
  const content = markdown.endsWith("\n") ? markdown.slice(0, -1) : markdown;
  if (/[\r\n\u2028\u2029]/u.test(content)) return false;
  // Use the same block parser as the editor without importing its DOM extensions.
  const block = gfmBlockOnlyParser.parse(markdown).topNode.firstChild;
  if (block === null) return markdown.indexOf("\n") === markdown.lastIndexOf("\n");
  if (block.nextSibling !== null) return false;
  const end = markdown.endsWith("\n") ? markdown.length - 1 : markdown.length;
  if (markdown.slice(0, block.from).includes("\n") || markdown.slice(block.to, end).includes("\n")) return false;

  const kinds = LEZER_NODE_IDS;
  let parsedContent = block;
  if (block.type.id === kinds.Blockquote) {
    const first = block.firstChild;
    if (first?.type.id !== kinds.QuoteMark) return false;
    if (first.nextSibling === null) return !markdown.slice(block.from, block.to).includes("\n");
    parsedContent = first.nextSibling;
    if (parsedContent.nextSibling !== null) return false;
  }
  let contentEnd = parsedContent.to;
  switch (parsedContent.type.id) {
    case kinds.Paragraph:
    case kinds.LinkReference:
    case kinds.HTMLBlock:
    case kinds.ProcessingInstructionBlock:
      break;
    case kinds.ATXHeading1:
    case kinds.ATXHeading2:
    case kinds.ATXHeading3:
      if (parsedContent !== block) return false;
      while (contentEnd > parsedContent.from && isSpaceChar(markdown.charCodeAt(contentEnd - 1))) contentEnd--;
      break;
    default:
      return false;
  }
  return !/[\r\n\u2028\u2029]/u.test(markdown.slice(block.from, contentEnd));
}
