import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FUT Manager — Squad Builder & Match Simulator",
  description: "Compose, analyse et teste un XI 4-3-3 sur le moteur de simulation FUT Manager.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
