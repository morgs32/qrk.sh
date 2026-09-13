import React from "react";
import { useParams } from "react-router";

export default function BrickDetail() {
  const { brickId } = useParams();
  return <h1>Brick {brickId}</h1>;
}
