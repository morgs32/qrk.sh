import { ClientOnly, createRootRoute, Outlet } from "@tanstack/react-router";
import { ZerospinDevtoolsLoader } from "@zerospin/react/ZerospinDevtoolsLoader";
import App from "@/app/App";
import RootLayout from "@/app/layout";
import AppError from "@/app/error";
import NotFound from "@/app/not-found";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "QRK.SH" },
    ],
    links: [{ rel: "icon", href: "/assets/favicon.ico" }],
  }),
  shellComponent: RootLayout,
  component: AppRoot,
  errorComponent: AppError,
  notFoundComponent: NotFound,
});

function AppRoot() {
  return (
    <ClientOnly>
      <App>
        <Outlet />
        {process.env.NODE_ENV === "development" && <ZerospinDevtoolsLoader defaultOpen={false} />}
      </App>
    </ClientOnly>
  );
}
