import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gravar" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
