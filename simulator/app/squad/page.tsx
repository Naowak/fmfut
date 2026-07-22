import Link from "next/link";
import { SquadBuilder } from "@/components/SquadBuilder";

export default function SquadPage() {
  return (
    <main className="page-shell squad-page-shell">
      <header className="hero squad-hero">
        <div>
          <p className="eyebrow">FUT MANAGER — SQUAD BUILDER V1</p>
          <h1>Construis un XI qui a du sens.</h1>
          <p className="hero-copy">Recherche, compare et teste chaque choix. Les diagnostics expliquent les forces, les risques et la fiabilité des projections.</p>
        </div>
        <nav className="hero-nav"><Link className="control-button nav-link" href="/">Simulateur</Link><Link className="control-button nav-link" href="/analytics">Balance Lab</Link></nav>
      </header>
      <SquadBuilder />
    </main>
  );
}
