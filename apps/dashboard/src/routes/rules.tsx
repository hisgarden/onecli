import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function RulesPage() {
  const [rules, setRules] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.api.rules.get().then(({ data }) => {
      if (data) setRules(data as unknown[]);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Policy Rules</h1>
      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule: any) => (
            <div key={rule.id} className="rounded-lg border bg-card p-4">
              <p className="font-medium">{rule.name}</p>
              <p className="text-sm text-muted-foreground">
                {rule.action} — {rule.hostPattern}
              </p>
            </div>
          ))}
          {rules.length === 0 && (
            <p className="text-muted-foreground">No policy rules yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
