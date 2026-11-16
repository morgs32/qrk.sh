import "@fontsource/silkscreen/400.css";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { AccountMenu } from "./AccountMenu";

export function Header() {
  const { username } = useValidatedParams(Schema.Struct({ username: Schema.String }));
  return (
    <header
      className="sticky top-0 z-50 h-14 shrink-0 @container border-b border-border bg-background lg:h-16"
      data-testid="dashboard-navbar"
    >
      <div className="qrk-responsive-insets flex h-full w-full items-center justify-between [padding-inline:var(--qrk-inset-inline)]">
        <a
          href={process.env.NEXT_PUBLIC_WEB_ORIGIN}
          aria-label="Home"
          className="text-lg"
          style={{ fontFamily: "Silkscreen, monospace" }}
        >
          QRK.SH
        </a>
        <div className="flex items-center gap-4">
          <Link to="/$username/settings" params={{ username }} className="text-sm underline">
            Settings
          </Link>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
