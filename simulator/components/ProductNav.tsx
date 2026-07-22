"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SQUAD_LINKS = [
  { href: "/squad", label: "Équipes", exact: true },
  { href: "/squad/match", label: "Matchs" },
  { href: "/squad/tests", label: "Tests Monte-Carlo" },
];
const ENGINE_LINKS = [
  { href: "/", label: "Simulateur", exact: true },
  { href: "/analytics", label: "Balance Lab" },
];

export function ProductNav() {
  const pathname = usePathname();
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
      <div className="product-nav-group product-nav-squad" aria-label="Gestion d’équipe">
        <span className="product-nav-label">MON ÉQUIPE</span>
        {SQUAD_LINKS.map(link)}
      </div>
      <div className="product-nav-group product-nav-engine" aria-label="Moteur et équilibrage">
        <span className="product-nav-label">MOTEUR</span>
        {ENGINE_LINKS.map(link)}
      </div>
    </nav>
  );
}
