import { ProductNav } from "@/components/ProductNav";
import { SquadBuilder } from "@/components/SquadBuilder";

export default function SquadPage() {
  return (
    <main className="page-shell squad-page-shell">
      <ProductNav />
      <SquadBuilder />
    </main>
  );
}
