"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const SQUAD_LINKS = [
  { href: "/squad", label: "Équipes", exact: true },
  { href: "/squad/match", label: "Matchs" },
  { href: "/squad/tests", label: "Simulateur" },
];
const ENGINE_LINKS = [
  { href: "/", label: "Partie rapide", exact: true },
  { href: "/analytics", label: "Monte Carlo Lab" },
];

export function ProductNav() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const stored = window.localStorage.getItem("fmfut:theme");
    const next = stored === "light" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);
  const link = ({ href, label, exact = false }: { href: string; label: string; exact?: boolean }) => {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link key={href} href={href} className="product-nav-link" data-active={active}>
        {label}
      </Link>
    );
  };

  return (
    <nav className="product-nav" aria-label="Navigation principale">
      <Link href="/squad" className="product-brand">FMFUT</Link>
      <div className="product-nav-group product-nav-squad" aria-label="Gestion d’équipe">
        {SQUAD_LINKS.map(link)}
      </div>
      <div className="product-nav-group product-nav-engine" aria-label="Moteur et équilibrage">
        {ENGINE_LINKS.map(link)}
      </div>
      <button className="theme-toggle" type="button" aria-label={theme === "dark" ? "Activer le mode clair" : "Activer le mode sombre"} onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next); document.documentElement.dataset.theme = next; window.localStorage.setItem("fmfut:theme", next);
      }}>{theme === "dark" ? "☀" : "☾"}</button>
    </nav>
  );
}
