import { ZerospinUserProvider } from "@/components/ZerospinUser";

export default function UsernameLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ZerospinUserProvider>{children}</ZerospinUserProvider>;
}
