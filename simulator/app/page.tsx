import Link from "next/link";
import { MatchSimulator } from "@/components/MatchSimulator";

export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">FUT MANAGER — MATCH ENGINE</p>
          <h1>Simulateur de match 2D</h1>
          <p className="hero-copy">
            Configure l'affichage, lance une simulation déterministe puis analyse le replay.
            Le résultat est calculé intégralement côté serveur avant la première image.
          </p>
        </div>
        <Link className="control-button nav-link" href="/analytics">
          Balance Lab
        </Link>
      </header>

      <MatchSimulator />
    </main>
  );
}
