import { MatchSimulator } from "@/components/MatchSimulator";
import { ProductNav } from "@/components/ProductNav";

export default function HomePage() {
  return (
    <main className="page-shell">
      <ProductNav />
      <header className="hero">
        <div>
          <p className="eyebrow">FUT MANAGER — MATCH ENGINE</p>
          <h1>Simulateur de match 2D</h1>
          <p className="hero-copy">
            Configure l'affichage, lance une simulation déterministe puis analyse le replay.
            Le résultat est calculé intégralement côté serveur avant la première image.
          </p>
        </div>
      </header>

      <MatchSimulator />
    </main>
  );
}
