import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { ProductNav } from "@/components/ProductNav";

export default function AnalyticsPage() {
  return (
    <main className="page-shell">
      <ProductNav />
      <header className="hero">
        <div>
          <p className="eyebrow">FUT MANAGER — BALANCE LAB</p>
          <h1>Monte-Carlo & analyse</h1>
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
