import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  KeyRound,
  Pencil,
  Trash2,
  ArrowLeft,
  Bot,
  Key,
  Settings2,
  Shield,
  Unlink,
  Link,
  Fingerprint,
  AlertCircle,
  RefreshCw,
  ExternalLink,
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
import { Badge } from "@onecli/ui/components/badge";
import { Input } from "@onecli/ui/components/input";
import { Label } from "@onecli/ui/components/label";
import { Skeleton } from "@onecli/ui/components/skeleton";
import { Separator } from "@onecli/ui/components/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@onecli/ui/components/accordion";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@onecli/ui/components/dialog";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import {
  useVaultStatus,
  useVaultPair,
  useVaultDisconnect,
  type BitwardenStatusData,
} from "@/hooks/use-vault-status";

// ── Types ─────────────────────────────────────────────────────────────

type SecretType = "anthropic" | "generic";

interface SecretItem {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  hostPattern: string;
  pathPattern: string | null;
  injectionConfig: unknown;
  createdAt: string;
}

interface InjectionConfig {
  headerName: string;
  valueFormat: string;
}

// ── Secret Dialog ─────────────────────────────────────────────────────

const SECRET_TYPE_OPTIONS = [
  {
    value: "anthropic" as const,
    label: "Anthropic API Key",
    description: "Inject your Anthropic key into requests to api.anthropic.com",
    icon: <Bot className="size-5" />,
    hostDefault: "api.anthropic.com",
  },
  {
    value: "generic" as const,
    label: "Generic Secret",
    description: "Inject a custom header into requests matching any host",
    icon: <Key className="size-5" />,
    hostDefault: "",
  },
];

const detectAnthropicKeyType = (
  val: string,
): "api_key" | "oauth_token" | null => {
  if (val.startsWith("sk-ant-api")) return "api_key";
  if (val.startsWith("sk-ant-oat")) return "oauth_token";
  return null;
};

const AnthropicKeyBadge = ({ value }: { value: string }) => {
  const detected = detectAnthropicKeyType(value);
  if (!detected) return null;
  return (
    <Badge
      variant="outline"
      className="text-muted-foreground animate-in fade-in shrink-0 gap-1.5 text-[10px] font-normal"
    >
      <span
        className={
          detected === "api_key"
            ? "bg-brand size-1.5 rounded-full"
            : "bg-blue-500 size-1.5 rounded-full"
        }
      />
      {detected === "api_key" ? "API Key" : "OAuth Token"}
    </Badge>
  );
};

const SecretDialog = ({
  open,
  onOpenChange,
  onSaved,
  secret,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  secret?: SecretItem;
}) => {
  const isEdit = !!secret;
  const [step, setStep] = useState<"type" | "form">("type");
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<SecretType>("anthropic");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [hostPattern, setHostPattern] = useState("api.anthropic.com");
  const [pathPattern, setPathPattern] = useState("");
  const [headerName, setHeaderName] = useState("Authorization");
  const [valueFormat, setValueFormat] = useState("Bearer {value}");

  const hostPatternError = (() => {
    const v = hostPattern.trim();
    if (!v) return null;
    if (v.includes("://"))
      return "Enter a hostname, not a URL (remove http:// or https://)";
    if (v.includes("/"))
      return "Enter a hostname only (use the path pattern field for paths)";
    if (v.includes(" ")) return "Hostname must not contain spaces";
    return null;
  })();

  useEffect(() => {
    if (open) {
      if (secret) {
        const config = secret.injectionConfig as InjectionConfig | null;
        setStep("form");
        setType(secret.type as SecretType);
        setName(secret.name);
        setValue("");
        setHostPattern(secret.hostPattern);
        setPathPattern(secret.pathPattern ?? "");
        setHeaderName(config?.headerName ?? "Authorization");
        setValueFormat(config?.valueFormat ?? "Bearer {value}");
      } else {
        setStep("type");
        setType("anthropic");
        setName("");
        setValue("");
        setHostPattern("api.anthropic.com");
        setPathPattern("");
        setHeaderName("Authorization");
        setValueFormat("Bearer {value}");
      }
    }
  }, [open, secret]);

  const handleSelectType = (selected: SecretType) => {
    setType(selected);
    const option = SECRET_TYPE_OPTIONS.find((o) => o.value === selected);
    setHostPattern(option?.hostDefault ?? "");
    setStep("form");
  };

  const isValid = isEdit
    ? hostPattern.trim() &&
      !hostPatternError &&
      (type !== "generic" || headerName.trim())
    : name.trim() &&
      value.trim() &&
      hostPattern.trim() &&
      !hostPatternError &&
      (type !== "generic" || headerName.trim());

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      if (isEdit) {
        await api.api.secrets({ secretId: secret.id }).patch({
          value: value.trim() || undefined,
          hostPattern,
          pathPattern: pathPattern || null,
          injectionConfig:
            type === "generic"
              ? { headerName, valueFormat: valueFormat || "{value}" }
              : undefined,
        });
        toast.success("Secret updated");
      } else {
        await api.api.secrets.post({
          name,
          type,
          value,
          hostPattern,
          pathPattern: pathPattern || undefined,
          injectionConfig:
            type === "generic"
              ? { headerName, valueFormat: valueFormat || "{value}" }
              : undefined,
        });
        toast.success("Secret created");
      }
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error(
        isEdit ? "Failed to update secret" : "Failed to create secret",
      );
    } finally {
      setSaving(false);
    }
  };

  const typeOption = SECRET_TYPE_OPTIONS.find((o) => o.value === type)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {step === "type" && !isEdit ? (
          <>
            <DialogHeader>
              <DialogTitle>Add secret</DialogTitle>
              <DialogDescription>
                Choose the type of credential to store.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              {SECRET_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSelectType(option.value)}
                  className="border-border hover:border-foreground/20 hover:bg-muted/50 flex items-start gap-4 rounded-lg border p-4 text-left transition-colors"
                >
                  <div className="bg-muted text-muted-foreground mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md">
                    {option.icon}
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="text-muted-foreground text-xs">
                      {option.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                {!isEdit && (
                  <button
                    onClick={() => setStep("type")}
                    className="text-muted-foreground hover:text-foreground -ml-1 rounded-md p-1 transition-colors"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                )}
                <DialogTitle>
                  {isEdit ? `Edit ${secret.name}` : typeOption.label}
                </DialogTitle>
              </div>
              <DialogDescription>
                {isEdit
                  ? "Update the secret's configuration. Leave the value field empty to keep the current value."
                  : type === "anthropic"
                    ? "Your key will be encrypted and injected into requests to api.anthropic.com."
                    : "Configure a custom secret to inject as a header into matching requests."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="secret-name">Name</Label>
                <Input
                  id="secret-name"
                  placeholder={
                    type === "anthropic"
                      ? "e.g. Anthropic Production Key"
                      : "e.g. GitHub Token"
                  }
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="secret-value">
                  {isEdit ? "New value" : "Secret value"}{" "}
                  {isEdit && (
                    <span className="text-muted-foreground font-normal">
                      (leave empty to keep current)
                    </span>
                  )}
                </Label>
                <Input
                  id="secret-value"
                  type="password"
                  placeholder={
                    type === "anthropic"
                      ? "sk-ant-api03-..."
                      : "Enter secret value"
                  }
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <p className="text-muted-foreground text-xs">
                    {type === "anthropic"
                      ? "Paste your API key or OAuth token from the Anthropic Console."
                      : "Encrypted at rest. You won't be able to view this value again."}
                  </p>
                  {type === "anthropic" && <AnthropicKeyBadge value={value} />}
                </div>
              </div>
              {type === "generic" && (
                <div className="space-y-2">
                  <Label htmlFor="secret-host">Host pattern</Label>
                  <Input
                    id="secret-host"
                    placeholder="e.g. api.example.com or *.example.com"
                    value={hostPattern}
                    onChange={(e) => setHostPattern(e.target.value)}
                  />
                  {hostPatternError ? (
                    <p className="text-xs text-red-500">{hostPatternError}</p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      The host this secret applies to. Use{" "}
                      <code className="text-xs">*.example.com</code> for
                      wildcard subdomains.
                    </p>
                  )}
                </div>
              )}
              <Accordion type="single" collapsible className="border-none">
                <AccordionItem value="advanced" className="border-t border-b-0">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <span className="text-muted-foreground flex items-center gap-2 text-xs font-normal">
                      <Settings2 className="size-3.5" />
                      Injection settings
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <div className="space-y-4">
                      {type === "anthropic" && (
                        <div className="space-y-2">
                          <Label htmlFor="secret-host-adv">Host pattern</Label>
                          <Input
                            id="secret-host-adv"
                            placeholder="e.g. api.example.com"
                            value={hostPattern}
                            onChange={(e) => setHostPattern(e.target.value)}
                          />
                          {hostPatternError ? (
                            <p className="text-xs text-red-500">
                              {hostPatternError}
                            </p>
                          ) : (
                            <p className="text-muted-foreground text-xs">
                              The host this secret applies to.
                            </p>
                          )}
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="secret-path">
                          Path pattern{" "}
                          <span className="text-muted-foreground font-normal">
                            (optional)
                          </span>
                        </Label>
                        <Input
                          id="secret-path"
                          placeholder="e.g. /v1/*"
                          value={pathPattern}
                          onChange={(e) => setPathPattern(e.target.value)}
                        />
                      </div>
                      {type === "generic" && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="secret-header">Header name</Label>
                            <Input
                              id="secret-header"
                              placeholder="e.g. Authorization"
                              value={headerName}
                              onChange={(e) => setHeaderName(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="secret-format">
                              Value format{" "}
                              <span className="text-muted-foreground font-normal">
                                (optional)
                              </span>
                            </Label>
                            <Input
                              id="secret-format"
                              placeholder="e.g. Bearer {value}"
                              value={valueFormat}
                              onChange={(e) => setValueFormat(e.target.value)}
                            />
                            <p className="text-muted-foreground text-xs">
                              Use <code className="text-xs">{"{value}"}</code>{" "}
                              as a placeholder for the secret.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} loading={saving} disabled={!isValid}>
                {saving
                  ? isEdit
                    ? "Saving..."
                    : "Creating..."
                  : isEdit
                    ? "Save Changes"
                    : "Add Secret"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Secret Card ───────────────────────────────────────────────────────

const SecretCard = ({
  secret,
  onUpdate,
}: {
  secret: SecretItem;
  onUpdate: () => void;
}) => {
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const config = secret.injectionConfig as InjectionConfig | null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.api.secrets({ secretId: secret.id }).delete();
      onUpdate();
      toast.success("Secret deleted");
    } catch {
      toast.error("Failed to delete secret");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">{secret.name}</h3>
              <Badge variant="secondary" className="text-xs">
                {secret.typeLabel}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">
                Host:{" "}
                <code className="bg-muted rounded px-1 py-0.5 font-mono">
                  {secret.hostPattern}
                </code>
              </span>
              {secret.pathPattern && (
                <span className="text-muted-foreground">
                  Path:{" "}
                  <code className="bg-muted rounded px-1 py-0.5 font-mono">
                    {secret.pathPattern}
                  </code>
                </span>
              )}
              {secret.type === "generic" && config?.headerName && (
                <span className="text-muted-foreground">
                  Header:{" "}
                  <code className="bg-muted rounded px-1 py-0.5 font-mono">
                    {config.headerName}
                  </code>
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Created {new Date(secret.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7">
                  <Trash2 className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete secret?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <strong>{secret.name}</strong>{" "}
                    and its encrypted value.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </Card>
      <SecretDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        secret={secret}
        onSaved={onUpdate}
      />
    </>
  );
};

// ── Vault Access Card ─────────────────────────────────────────────────

const statusBadge = (isReady: boolean, hasError: boolean) => {
  if (hasError)
    return {
      className:
        "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
      dotClassName: "bg-red-500",
      label: "Error",
    };
  return {
    className:
      "border-brand/20 bg-brand/5 text-brand dark:border-brand/30 dark:bg-brand/10 dark:text-brand",
    dotClassName: "bg-brand",
    label: isReady ? "Connected" : "Paired",
  };
};

const VaultAccessCard = () => {
  const { status, loading, isPaired, isReady, fetchStatus } =
    useVaultStatus<BitwardenStatusData>();
  const { pair, pairing } = useVaultPair(fetchStatus);
  const { disconnect, disconnecting } = useVaultDisconnect(fetchStatus);
  const [pairingCode, setPairingCode] = useState("");

  const isValidCode =
    pairingCode.includes("_") &&
    pairingCode.split("_").length === 2 &&
    pairingCode.split("_").every((part) => part.length === 64);

  const handlePair = async () => {
    const parts = pairingCode.split("_");
    const success = await pair(parts[0]!, parts[1]!);
    if (success) setPairingCode("");
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-14 w-full" />
          <Separator />
          <Skeleton className="h-8 w-28" />
        </CardContent>
      </Card>
    );
  }

  if (isPaired) {
    const badge = statusBadge(isReady, !!status?.status_data?.last_error);
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="text-muted-foreground size-4" />
              <CardTitle>Bitwarden Vault</CardTitle>
              <Badge
                variant="secondary"
                className="text-[10px] font-normal px-1.5 py-0"
              >
                Beta
              </Badge>
            </div>
            <Badge variant="outline" className={badge.className}>
              <span
                className={`mr-1.5 inline-block size-1.5 rounded-full ${badge.dotClassName}`}
              />
              {badge.label}
            </Badge>
          </div>
          <CardDescription>
            Credentials are fetched on-demand when no matching local secrets are
            configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {status?.status_data?.fingerprint && (
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
                <Fingerprint className="size-3" />
                Device Fingerprint
              </Label>
              <code className="bg-muted text-muted-foreground rounded px-2 py-1.5 font-mono text-xs break-all">
                {status.status_data.fingerprint}
              </code>
            </div>
          )}
          {status?.status_data?.last_error && (
            <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border border-red-200 p-3 text-sm dark:border-red-900">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div className="grid gap-1.5">
                <span>{status.status_data.last_error}</span>
                <p className="text-muted-foreground text-xs">
                  Make sure{" "}
                  <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                    aac listen
                  </code>{" "}
                  is running and your Bitwarden vault is unlocked.{" "}
                  <a
                    href="https://www.onecli.sh/docs/vaults/bitwarden#troubleshooting"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:no-underline"
                  >
                    Troubleshooting
                  </a>
                </p>
                <button
                  onClick={fetchStatus}
                  className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs underline-offset-2 hover:underline"
                >
                  <RefreshCw className="size-3" />
                  Refresh status
                </button>
              </div>
            </div>
          )}
          <Separator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-fit" size="sm">
                <Unlink className="size-3.5" />
                Disconnect
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect vault?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the pairing with your Bitwarden vault. You
                  can reconnect at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={disconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="text-muted-foreground size-4" />
          <CardTitle>Bitwarden Vault</CardTitle>
          <Badge
            variant="secondary"
            className="text-[10px] font-normal px-1.5 py-0"
          >
            Beta
          </Badge>
        </div>
        <CardDescription>
          Connect your Bitwarden vault to inject credentials on-demand without
          storing them on the server.{" "}
          <a
            href="https://www.onecli.sh/docs/vaults/bitwarden"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground inline-flex items-center gap-0.5 underline underline-offset-2 hover:no-underline"
          >
            Setup guide
            <ExternalLink className="size-3" />
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="pairing-code">Pairing Code</Label>
          <Input
            id="pairing-code"
            value={pairingCode}
            onChange={(e) => setPairingCode(e.target.value)}
            placeholder="a1b2c3d4..._e5f6a7b8..."
            className="font-mono text-sm"
          />
          <p className="text-muted-foreground text-xs">
            Paste the full code from{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs font-mono">
              aac listen --psk
            </code>
            .
          </p>
        </div>
        <Button
          onClick={handlePair}
          loading={pairing}
          disabled={!isValidCode}
          className="w-fit"
        >
          <Link className="size-3.5" />
          {pairing ? "Connecting..." : "Connect Vault"}
        </Button>
      </CardContent>
    </Card>
  );
};

// ── Secrets Page ──────────────────────────────────────────────────────

export function SecretsPage() {
  const [secrets, setSecrets] = useState<SecretItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchSecrets = useCallback(async () => {
    const { data } = await api.api.secrets.get();
    if (data) setSecrets(data as SecretItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSecrets();
  }, [fetchSecrets]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 max-w-5xl">
        <PageHeader
          title="Secrets"
          description="Manage encrypted credentials that the gateway injects into requests."
        />
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i} className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="size-8 rounded-md" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 max-w-5xl">
      <PageHeader
        title="Secrets"
        description="Manage encrypted credentials that the gateway injects into requests."
      />
      <div className="space-y-8">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Local Secrets</h3>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
              Add Secret
            </Button>
          </div>
          {secrets.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <div className="bg-muted mb-4 flex size-12 items-center justify-center rounded-full">
                <KeyRound className="text-muted-foreground size-6" />
              </div>
              <p className="text-sm font-medium">No secrets yet</p>
              <p className="text-muted-foreground mt-1 max-w-xs text-xs">
                Add a secret to inject encrypted credentials into gateway
                requests.
              </p>
            </Card>
          ) : (
            secrets.map((secret) => (
              <SecretCard
                key={secret.id}
                secret={secret}
                onUpdate={fetchSecrets}
              />
            ))
          )}
          <SecretDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSaved={fetchSecrets}
          />
        </section>
        <section className="space-y-4">
          <h3 className="text-sm font-medium">Bitwarden Vault</h3>
          <VaultAccessCard />
        </section>
      </div>
    </div>
  );
}
