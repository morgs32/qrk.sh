import type { IInferDecodedRow } from "@zerospin/shapes";
import type { githubActivityV1 } from "./githubActivityV1";

const defaultData = {
  contributions: Array.from({ length: 365 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (364 - index));

    // Mix each day's index to avoid repeating stripes while keeping samples stable.
    let sample = Math.imul(index + 1, 0x45d9f3b);
    sample = Math.imul(sample ^ (sample >>> 16), 0x45d9f3b);
    sample = (sample ^ (sample >>> 16)) >>> 0;
    const count = sample % 100 < 30 ? 0 : 1 + (sample % 15);
    const level: 0 | 1 | 2 | 3 | 4 =
      count === 0 ? 0 : count <= 3 ? 1 : count <= 7 ? 2 : count <= 11 ? 3 : 4;

    return { date: date.toISOString().slice(0, 10), count, level };
  }),
};

export const githubActivityPreviewState = {
  payload: { url: "https://github.com/morgs32" },
  data: defaultData,
} satisfies IInferDecodedRow<typeof githubActivityV1.stateShape>;
