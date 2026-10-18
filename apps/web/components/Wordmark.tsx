import Link from "next/link";

export function Wordmark() {
  return (
    <Link
      aria-label="QRK.SH home"
      className="font-[family-name:var(--font-silkscreen)] text-lg font-normal"
      href="/"
    >
      QRK.SH
    </Link>
  );
}
