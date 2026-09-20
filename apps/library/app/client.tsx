import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { loadDevtools } from "@zerospin/react";

// Eager DevTools console API — client startup only, never during React render.
void loadDevtools({ defaultOpen: true });

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
