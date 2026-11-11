import type { IInferDecodedRow } from "@zerospin/shapes";
import type { swatchAndIconV1 } from "./swatchAndIconV1";

const defaultData = {
  name: "Asterisk",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 20v60M20 35l60 30M20 65l60-30" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="8"/></svg>',
};

export const swatchAndIconPreviewState = {
  payload: { hash: "", color: "#4A7C59" },
  data: defaultData,
} satisfies IInferDecodedRow<typeof swatchAndIconV1.stateShape>;
