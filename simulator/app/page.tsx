import { MatchSimulator } from "@/components/MatchSimulator";
import { ProductNav } from "@/components/ProductNav";

export default function HomePage() {
  return (
    <main className="page-shell">
      <ProductNav />
      <header className="hero">
        <div>
          <p className="eyebrow">FUT MANAGER — PARTIE RAPIDE</p>
          <h1>Deux sélections, un match.</h1>
          <p className="hero-copy">
            Choisis parmi les 48 sélections, lance une simulation déterministe puis analyse le replay.
            Le résultat est calculé intégralement côté serveur avant la première image.
          </p>
        </div>
      </header>

      <MatchSimulator />
    </main>
  );
}
