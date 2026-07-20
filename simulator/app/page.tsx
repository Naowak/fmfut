import Link from "next/link";
import { MatchSimulator } from "@/components/MatchSimulator";

export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">FUT MANAGER — PROTOTYPE MOTEUR</p>
          <h1>Simulateur de match 2D</h1>
          <p className="hero-copy">
            Le match est calculé entièrement côté serveur à partir d&apos;une seed.
            Le client reçoit ensuite un replay immuable et ne fait que l&apos;afficher.
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
