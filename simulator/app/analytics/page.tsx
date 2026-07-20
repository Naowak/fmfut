import Link from "next/link";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export default function AnalyticsPage() {
  return (
    <main className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">FUT MANAGER — BALANCE LAB</p>
          <h1>Monte-Carlo & analyse</h1>
          <p className="hero-copy">
            Mesure le comportement du moteur sur des séries de matchs
            déterministes, sans générer de replay.
          </p>
        </div>
        <Link className="control-button nav-link" href="/">
          Retour au match
        </Link>
      </header>

      <AnalyticsDashboard />
    </main>
  );
}
