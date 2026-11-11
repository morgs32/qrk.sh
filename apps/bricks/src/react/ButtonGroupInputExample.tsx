import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from "lucide-react";
import { useState } from "react";

import { ButtonGroupInput } from "./ButtonGroupInput";

export function ButtonGroupInputExample() {
  const [align, setAlign] = useState("center");

  return (
    <ButtonGroupInput
      label="Align"
      value={align}
      onChange={setAlign}
      options={[
        { value: "left", label: "Align Left", icon: <AlignLeft aria-hidden /> },
        { value: "center", label: "Align Center", icon: <AlignCenter aria-hidden /> },
        { value: "right", label: "Align Right", icon: <AlignRight aria-hidden /> },
        { value: "justify", label: "Align Justify", icon: <AlignJustify aria-hidden /> },
      ]}
    />
  );
}
