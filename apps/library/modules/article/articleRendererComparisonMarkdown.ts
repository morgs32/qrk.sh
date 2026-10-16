export const articleRendererComparisonMarkdown = `A readable article should keep **bold**, *italic*, ~~struck text~~, and [explicit links](https://example.com) intact. Use \`inline code\` in the same sentence.

## Lists and tasks

- A first idea
  - With a nested detail
- A second idea

1. Write in Markdown
2. Render the saved article

- [x] Keep Meowdown for editing
- [ ] Choose the read-only renderer

> The same saved Markdown goes to both renderers.

## Code and tables

\`\`\`ts
const article = {
  title: "A Markdown article",
  content: "Render this on the server.",
};
\`\`\`

| Responsibility | Requirement |
| --- | --- |
| Editing | Meowdown |
| Reading | A complete article body |
| HTML generation | No browser or DOM required |

## Line breaks and links

This is a soft line break.
This continues the same paragraph.

This has two trailing spaces.\u0020\u0020
This follows a hard line break.

An explicit link: [Example](https://example.com).

A bare URL: https://example.com.

## Saved image dimensions

The image below has a Meowdown size comment: 320 × 120.

![A 640 by 240 image](https://placehold.co/640x240/png)<!-- {"width":320,"height":120} -->

## Additional syntax

A ==highlighted phrase== and a [[wiki link]].

Inline math: $E = mc^2$.

\`\`\`math
E = mc^2
\`\`\`

## Literal HTML

<strong>This is raw HTML in the Markdown source.</strong>
`;
