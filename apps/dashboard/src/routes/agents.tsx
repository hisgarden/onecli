import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function AgentsPage() {
  const [agents, setAgents] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.api.agents.get().then(({ data }) => {
      if (data) setAgents(data as unknown[]);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Agents</h1>
      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="grid gap-4">
          {agents.map((agent: any) => (
            <div key={agent.id} className="rounded-lg border bg-card p-4">
              <p className="font-medium">{agent.name}</p>
              <p className="text-sm text-muted-foreground">
                {agent.identifier}
              </p>
            </div>
          ))}
          {agents.length === 0 && (
            <p className="text-muted-foreground">No agents yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
