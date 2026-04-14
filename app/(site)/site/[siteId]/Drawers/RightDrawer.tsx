"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Compose } from "../page/[pageId]/Compose/Compose";

const drawerTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

const COMPOSE_ARIA_LABEL = "Compose drawer";

export function RightDrawer(props: { data: "compose" }) {
  const { data } = props;
  const router = useRouter();
  const pathname = usePathname();

  const onCloseCompose = () => {
    const base = pathname.replace(/\/compose\/?$/, "");
    router.push(base.length > 0 ? base : pathname);
  };

  return (
    <AnimatePresence>
      {data === "compose" ? (
        <motion.div
          key="right-drawer"
          role="dialog"
          aria-label={COMPOSE_ARIA_LABEL}
          aria-hidden={false}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={drawerTransition}
          className={cn(
            "fixed top-16 right-0 bottom-0 z-40 flex h-[calc(100vh-4rem)] w-full min-h-0 flex-col border-l border-border bg-background shadow-[-4px_0_20px_-6px_rgb(0_0_0/0.07),-2px_0_10px_-4px_rgb(0_0_0/0.04)] md:w-1/2 dark:shadow-[-4px_0_20px_-6px_rgb(0_0_0/0.2),-2px_0_10px_-4px_rgb(0_0_0/0.1)]",
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Compose onClose={onCloseCompose} />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
