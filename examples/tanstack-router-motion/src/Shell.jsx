import React from "react";
import { Outlet } from "@tanstack/react-router";
import { motion } from "framer-motion";

export function Shell({ side }) {
  React.useEffect(() => {
    window.events.push(`mount:${side}`);
    return () => window.events.push(`unmount:${side}`);
  }, []);
  return (
    <motion.section
      data-drawer={side}
      initial={{ x: side === "left" ? -400 : 400 }}
      animate={{ x: 0 }}
      exit={{ x: side === "left" ? -400 : 400 }}
      transition={{ duration: 0.3 }}
      style={{
        position: "fixed",
        top: 100,
        [side]: 0,
        width: 350,
        background: "#dde",
        padding: 20,
      }}
    >
      <Outlet />
    </motion.section>
  );
}
