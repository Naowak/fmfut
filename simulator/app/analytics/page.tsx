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
        <nav className="hero-nav">
          <Link className="primary-button nav-link" href="/squad">Squad Builder</Link>
          <Link className="control-button nav-link" href="/">Retour au match</Link>
        </nav>
      </header>

      <AnalyticsDashboard />
    </main>
  );
}
