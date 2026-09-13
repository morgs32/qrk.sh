// @ts-check
import React from "react";

/** @param {import("./+types/BrickDetail").Route.ComponentProps} props */
export default function BrickDetail(props) {
  const { brickId } = props.params;
  return <h1>Brick {brickId}</h1>;
}
