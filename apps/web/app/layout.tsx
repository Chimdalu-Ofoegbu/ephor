import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ephor — The state never stops",
  description: "Business continuity as programmable settlement on Arc.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
