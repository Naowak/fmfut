import { ProductNav } from "@/components/ProductNav";
import { SquadBuilder } from "@/components/SquadBuilder";

export default function SquadPage() {
  return (
    <main className="page-shell squad-page-shell">
      <ProductNav />
      <header className="squad-page-heading">
        <p className="eyebrow">FUT MANAGER — V0.10.0 · ÉQUIPES</p>
        <h1>Construis un XI qui a du sens.</h1>
        <p className="hero-copy">Recherche, compare et organise ton équipe. Les matchs et les tests Monte-Carlo disposent désormais de leurs propres écrans.</p>
      </header>
      <SquadBuilder />
    </main>
  );
}
