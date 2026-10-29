import { useEffect } from "react";
import type { IInferDecodedRow } from "@zerospin/shapes";
import { swatchAndIconV1 } from "@qrk.sh/zerospin/src/modules/swatchAndIcon/swatchAndIconV1";
import { SwatchAndIcon } from "./SwatchAndIcon";

const frames = [
  swatchAndIconV1.defaultState,
  {
    payload: { hash: "", color: "#D4A373" },
    data: {
      name: "Sun",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="18" fill="none" stroke="currentColor" stroke-width="6"/><path d="M50 8v12m0 60v12M8 50h12m60 0h12M20 20l9 9m42 42 9 9M20 80l9-9m42-42 9-9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="6"/></svg>',
    },
  },
  {
    payload: { hash: "", color: "#577590" },
    data: {
      name: "Waves",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M12 30q19-20 38 0t38 0M12 50q19-20 38 0t38 0M12 70q19-20 38 0t38 0" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="6"/></svg>',
    },
  },
  {
    payload: { hash: "", color: "#9D8ABF" },
    data: {
      name: "Diamond",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="m50 12 32 38-32 38-32-38Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="6"/></svg>',
    },
  },
];

export function SwatchAndIconPreview(props: {
  state: IInferDecodedRow<typeof swatchAndIconV1.stateShape>;
  setState: (state: IInferDecodedRow<typeof swatchAndIconV1.stateShape>) => void;
  isActive: boolean;
}) {
  const { state, setState, isActive } = props;
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      const currentIndex = frames.findIndex((frame) => frame.data.name === state.data.name);
      setState(frames[(currentIndex + 1) % frames.length]);
    }, 2000);
    return () => clearInterval(interval);
  }, [state, setState, isActive]);
  return <SwatchAndIcon state={state} />;
}
