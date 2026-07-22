import { ProductNav } from "@/components/ProductNav";
import { SquadMatchLauncher } from "@/components/SquadMatchLauncher";

export default function SquadMatchPage() {
  return (
    <main className="page-shell squad-page-shell">
      <ProductNav />
      <header className="squad-page-heading">
        <p className="eyebrow">FUT MANAGER — V0.10.0 · MATCHS</p>
        <h1>Choisis l’adversaire, puis joue.</h1>
        <p className="hero-copy">Ta composition sauvegardée affronte un XI international précomposé. Le replay reste sur un écran dédié et responsive.</p>
      </header>
      <SquadMatchLauncher />
    </main>
  );
}
