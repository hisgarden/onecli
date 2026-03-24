import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function OverviewPage() {
  const [counts, setCounts] = useState<{
    agents: number;
    secrets: number;
  } | null>(null);

  useEffect(() => {
    api.api.counts.get().then(({ data }) => {
      if (data) setCounts(data as { agents: number; secrets: number });
    });
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      {counts ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Agents</p>
            <p className="text-3xl font-bold">{counts.agents}</p>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Secrets</p>
            <p className="text-3xl font-bold">{counts.secrets}</p>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">Loading...</p>
      )}
    </div>
  );
}
