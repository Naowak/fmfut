import { ProductNav } from "@/components/ProductNav";
import { SquadMatchLauncher } from "@/components/SquadMatchLauncher";

export default function SquadMatchPage() {
  return (
    <main className="page-shell squad-page-shell">
      <ProductNav />
      <SquadMatchLauncher />
    </main>
  );
}
