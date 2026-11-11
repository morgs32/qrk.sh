import { useState } from "react";

import { DropdownInput } from "./DropdownInput";

export function DropdownInputExample() {
  const [fit, setFit] = useState("cover");

  return (
    <DropdownInput
      label="Fit"
      value={fit}
      onChange={setFit}
      options={[
        { value: "cover", label: "Cover" },
        { value: "contain", label: "Contain" },
        { value: "fill", label: "Fill" },
      ]}
    />
  );
}
