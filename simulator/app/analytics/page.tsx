import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { ProductNav } from "@/components/ProductNav";

export default function AnalyticsPage() {
  return (
    <main className="page-shell">
      <ProductNav />
      <AnalyticsDashboard />
    </main>
  );
}
