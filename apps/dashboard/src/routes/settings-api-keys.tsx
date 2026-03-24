import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function SettingsApiKeysPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.api.user["api-key"]
      .get()
      .then(({ data }) => {
        if (data) setApiKey((data as { apiKey: string }).apiKey);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">API Keys</h1>
      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="rounded-lg border bg-card p-6">
          {apiKey ? (
            <code className="text-sm">{apiKey}</code>
          ) : (
            <p className="text-muted-foreground">No API key generated yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
