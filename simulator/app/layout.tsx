import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FUT Manager — Match Simulator",
  description: "Prototype de moteur de match 2D pré-simulé côté serveur",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
