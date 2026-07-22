import { ProductNav } from "@/components/ProductNav";
import { SquadTestLab } from "@/components/SquadTestLab";

export default function SquadTestsPage() {
  return (
    <main className="page-shell squad-page-shell">
      <ProductNav />
      <header className="squad-page-heading">
        <p className="eyebrow">FUT MANAGER — V0.10.0 · SIMULATEUR</p>
        <h1>Mesure ce que ton équipe produit.</h1>
        <p className="hero-copy">Résultats, distributions, statistiques collectives et détail exhaustif de chaque joueur, exprimés en moyenne par match.</p>
      </header>
      <SquadTestLab />
    </main>
  );
}
