import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { ProductNav } from "@/components/ProductNav";

export default function AnalyticsPage() {
  return (
    <main className="page-shell">
      <ProductNav />
      <header className="hero">
        <div>
          <p className="eyebrow">FUT MANAGER — MONTE CARLO LAB</p>
          <h1>Monte-Carlo & analyse du moteur</h1>
          <p className="hero-copy">
            Mesure le comportement du moteur sur des séries de matchs
            déterministes, sans générer de replay.
          </p>
        </div>
      </header>

      <AnalyticsDashboard />
    </main>
  );
}
