import React from "react";
import { Outlet } from "react-router";
import { Shell } from "../Shell";

export const handle = { drawer: "left" };

export default function LeftDrawerLayout() {
  return (
    <Shell side="left">
      <Outlet />
    </Shell>
  );
}
