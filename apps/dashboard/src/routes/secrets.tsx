import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function SecretsPage() {
  const [secrets, setSecrets] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.api.secrets.get().then(({ data }) => {
      if (data) setSecrets(data as unknown[]);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Secrets</h1>
      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="grid gap-4">
          {secrets.map((secret: any) => (
            <div key={secret.id} className="rounded-lg border bg-card p-4">
              <p className="font-medium">{secret.name}</p>
              <p className="text-sm text-muted-foreground">
                {secret.typeLabel} — {secret.hostPattern}
              </p>
            </div>
          ))}
          {secrets.length === 0 && (
            <p className="text-muted-foreground">No secrets yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
