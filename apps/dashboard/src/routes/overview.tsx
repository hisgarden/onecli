import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  KeyRound,
  ArrowRight,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@onecli/ui/components/card";
import { Button } from "@onecli/ui/components/button";
import { Skeleton } from "@onecli/ui/components/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@onecli/ui/components/alert-dialog";
import { PageHeader } from "@/components/page-header";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { api } from "@/lib/api";

// ── API Key Card ──────────────────────────────────────────────────────

const ApiKeyCard = () => {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  useEffect(() => {
    api.api.user["api-key"]
      .get()
      .then(({ data }) => {
        if (data && "apiKey" in data)
          setApiKey((data as { apiKey: string }).apiKey ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const truncatedKey = apiKey
    ? `${apiKey.slice(0, 6)}${"•".repeat(12)}${apiKey.slice(-4)}`
    : "";

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const { data } = await api.api.user["api-key"].regenerate.post();
      if (data && "apiKey" in data) {
        setApiKey((data as { apiKey: string }).apiKey);
        setRevealed(true);
        toast.success("API key regenerated");
      }
    } catch {
      toast.error("Failed to regenerate API key");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Key</CardTitle>
        <CardDescription>
          Your personal API key for OneCLI services.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          {loading ? (
            <Skeleton className="h-9 flex-1 rounded-md" />
          ) : (
            <code className="bg-muted min-w-0 flex-1 truncate rounded-md border px-3 py-2 font-mono text-sm select-none">
              {!apiKey ? (
                <span className="text-muted-foreground">No API key yet</span>
              ) : revealed ? (
                apiKey
              ) : (
                truncatedKey
              )}
            </code>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setRevealed(!revealed)}
            disabled={loading || !apiKey}
          >
            {revealed ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => copy(apiKey)}
            disabled={loading || !apiKey}
          >
            {copied ? (
              <Check className="size-4 text-brand" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={loading || regenerating || !apiKey}
              >
                <RefreshCw
                  className={`size-4 ${regenerating ? "animate-spin" : ""}`}
                />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Regenerate API key?</AlertDialogTitle>
                <AlertDialogDescription>
                  The current API key will be invalidated immediately. Any
                  services using the old key will lose access.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleRegenerate}
                  disabled={regenerating}
                >
                  {regenerating ? "Regenerating..." : "Regenerate"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
};

// ── Stats Cards ───────────────────────────────────────────────────────

const StatsCards = ({
  agentCount,
  secretCount,
  loading = false,
}: {
  agentCount: number;
  secretCount: number;
  loading?: boolean;
}) => (
  <div className="grid gap-4 sm:grid-cols-2">
    <Link to="/agents" className="group">
      <Card className="py-4 gap-3 transition-colors hover:border-foreground/20 cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Agents</CardTitle>
          <Bot className="text-muted-foreground size-4 transition-colors group-hover:text-blue-500" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-7 w-8 mb-1" />
          ) : (
            <div className="text-2xl font-bold">{agentCount}</div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">Configured agents</p>
            <ArrowRight className="size-3.5 text-muted-foreground/0 transition-all group-hover:text-muted-foreground group-hover:translate-x-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
    <Link to="/secrets" className="group">
      <Card className="py-4 gap-3 transition-colors hover:border-foreground/20 cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Secrets</CardTitle>
          <KeyRound className="text-muted-foreground size-4 transition-colors group-hover:text-amber-500" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-7 w-8 mb-1" />
          ) : (
            <div className="text-2xl font-bold">{secretCount}</div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">
              Encrypted credentials
            </p>
            <ArrowRight className="size-3.5 text-muted-foreground/0 transition-all group-hover:text-muted-foreground group-hover:translate-x-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  </div>
);

// ── Overview Page ─────────────────────────────────────────────────────

export function OverviewPage() {
  const [counts, setCounts] = useState({ agents: 0, secrets: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.api.counts.get().then(({ data }) => {
      if (data) setCounts(data as { agents: number; secrets: number });
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 max-w-5xl">
      <PageHeader
        title="Overview"
        description="Your OneCLI dashboard at a glance."
      />
      <ApiKeyCard />
      <StatsCards
        agentCount={counts.agents}
        secretCount={counts.secrets}
        loading={loading}
      />
    </div>
  );
}
