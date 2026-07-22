import { MatchSimulator } from "@/components/MatchSimulator";
import { ProductNav } from "@/components/ProductNav";

export default function HomePage() {
  return (
    <main className="page-shell">
      <ProductNav />
      <MatchSimulator />
    </main>
  );
}
