import type { IInferDecodedRow } from "@zerospin/shapes";
import type { articleV1 } from "./articleV1";

export const articlePreviewState = {
  title: "Actually good advice",
  subtitle: "Take it or leave it",
  content: `For a long time, I’ve been collecting pieces of advice that are:

1. Applicable to anybody
2. Likely to help and unlikely to harm
3. Things I have actually tried and worked for me/things I have seen work for other people
4. Useful even without lots of context and wisdom

Here’s what I got.`,
} satisfies IInferDecodedRow<typeof articleV1.stateShape>;
