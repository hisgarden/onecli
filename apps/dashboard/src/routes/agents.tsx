import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Plus,
  Bot,
  MoreHorizontal,
  RotateCw,
  Trash2,
  KeyRound,
  Pencil,
  Copy,
  Check,
  CircleCheck,
  Search,
  Globe,
  ListChecks,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@onecli/ui/components/card";
import { Button } from "@onecli/ui/components/button";
import { Badge } from "@onecli/ui/components/badge";
import { Input } from "@onecli/ui/components/input";
import { Label } from "@onecli/ui/components/label";
import { Checkbox } from "@onecli/ui/components/checkbox";
import { Skeleton } from "@onecli/ui/components/skeleton";
import { ScrollArea } from "@onecli/ui/components/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@onecli/ui/components/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@onecli/ui/components/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@onecli/ui/components/dialog";
import { cn } from "@onecli/ui/lib/utils";
import { PageHeader } from "@/components/page-header";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────

type SecretMode = "all" | "selective";

interface Agent {
  id: string;
  name: string;
  identifier: string | null;
  accessToken: string;
  isDefault: boolean;
  secretMode: SecretMode;
  createdAt: string;
  _count: { agentSecrets: number };
}

interface Secret {
  id: string;
  name: string;
  typeLabel: string;
  hostPattern: string;
}

// ── Manage Secrets Dialog ─────────────────────────────────────────────

const ManageSecretsDialog = ({
  agent,
  open,
  onOpenChange,
  onUpdated,
}: {
  agent: { id: string; name: string; secretMode: SecretMode };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) => {
  const [mode, setMode] = useState<SecretMode>(
    agent.secretMode === "selective" ? "selective" : "all",
  );
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allRes, assignedRes] = await Promise.all([
        api.api.secrets.get(),
        api.api.agents({ agentId: agent.id }).secrets.get(),
      ]);
      if (allRes.data) setSecrets(allRes.data as Secret[]);
      if (assignedRes.data)
        setSelectedIds(new Set(assignedRes.data as string[]));
    } catch {
      toast.error("Failed to load secrets");
    } finally {
      setLoading(false);
    }
  }, [agent.id]);

  useEffect(() => {
    if (open) {
      setMode(agent.secretMode === "selective" ? "selective" : "all");
      setSearch("");
      fetchData();
    }
  }, [open, agent.secretMode, fetchData]);

  const filteredSecrets = useMemo(() => {
    if (!search.trim()) return secrets;
    const q = search.toLowerCase();
    return secrets.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.hostPattern.toLowerCase().includes(q),
    );
  }, [secrets, search]);

  const toggleSecret = (secretId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(secretId) ? next.delete(secretId) : next.add(secretId);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.api
        .agents({ agentId: agent.id })
        ["secret-mode"].patch({ mode });
      if (mode === "selective") {
        await api.api
          .agents({ agentId: agent.id })
          .secrets.put({ secretIds: Array.from(selectedIds) });
      }
      onUpdated();
      onOpenChange(false);
      toast.success("Secret permissions updated");
    } catch {
      toast.error("Failed to update secret permissions");
    } finally {
      setSaving(false);
    }
  };

  const isSelective = mode === "selective";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>Secret access for {agent.name}</DialogTitle>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Secrets are injected by the gateway at request time. The agent never
            sees raw values.
          </p>
        </DialogHeader>
        <div className="space-y-2 px-6 pb-2">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Access mode
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                value: "all" as const,
                icon: Globe,
                label: "All secrets",
                desc: "Every secret in your account",
              },
              {
                value: "selective" as const,
                icon: ListChecks,
                label: "Selective",
                desc: "Choose specific secrets",
              },
            ].map(({ value, icon: Icon, label, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                  mode === value
                    ? "border-foreground/30 bg-muted/60"
                    : "border-border hover:bg-muted/30",
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={cn(
                      "size-3.5",
                      mode === value
                        ? "text-foreground"
                        : "text-muted-foreground/60",
                    )}
                  />
                  <p
                    className={cn(
                      "text-sm font-medium",
                      mode !== value && "text-muted-foreground",
                    )}
                  >
                    {label}
                  </p>
                </div>
                <p className="text-muted-foreground text-xs">{desc}</p>
              </button>
            ))}
          </div>
        </div>
        {isSelective && (
          <div className="px-6 pt-2 pb-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              </div>
            ) : secrets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="bg-muted mb-3 flex size-10 items-center justify-center rounded-full">
                  <KeyRound className="text-muted-foreground size-4" />
                </div>
                <p className="text-sm font-medium">No secrets yet</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Add secrets in the Secrets page first.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                  <Input
                    placeholder="Filter secrets..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 pl-8 text-sm"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-xs">
                    <span className="text-foreground font-medium">
                      {selectedIds.size}
                    </span>{" "}
                    of {secrets.length} selected
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIds(new Set(secrets.map((s) => s.id)))
                      }
                      className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                    >
                      Select all
                    </button>
                    <span className="text-muted-foreground/40 text-xs">/</span>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <ScrollArea className="h-[200px] overflow-hidden rounded-md border">
                  <div className="divide-border divide-y">
                    {filteredSecrets.map((secret) => (
                      <label
                        key={secret.id}
                        className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors"
                      >
                        <Checkbox
                          checked={selectedIds.has(secret.id)}
                          onCheckedChange={() => toggleSecret(secret.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {secret.name}
                          </p>
                          <code className="text-muted-foreground text-xs">
                            {secret.hostPattern}
                          </code>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {secret.typeLabel}
                        </Badge>
                      </label>
                    ))}
                    {filteredSecrets.length === 0 && (
                      <p className="text-muted-foreground py-6 text-center text-xs">
                        No secrets match &ldquo;{search}&rdquo;
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="border-border/50 border-t px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={loading}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Create Agent Dialog ───────────────────────────────────────────────

const nameToIdentifier = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

const CreateAgentDialog = ({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) => {
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdIdentifier, setCreatedIdentifier] = useState<string | null>(
    null,
  );
  const { copied, copy } = useCopyToClipboard();

  const handleNameChange = (value: string) => {
    setName(value);
    if (!identifierTouched) setIdentifier(nameToIdentifier(value));
  };

  const handleIdentifierChange = (value: string) => {
    setIdentifierTouched(true);
    setIdentifier(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  };

  const isValidIdentifier = /^[a-z][a-z0-9-]{0,49}$/.test(identifier);

  const handleCreate = async () => {
    if (!name.trim() || !isValidIdentifier) return;
    setCreating(true);
    try {
      const { data } = await api.api.agents.post({ name, identifier });
      if (data && "identifier" in data) {
        setCreatedIdentifier((data as { identifier: string }).identifier);
        onCreated();
        toast.success("Agent created");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create agent",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      setName("");
      setIdentifier("");
      setIdentifierTouched(false);
      setCreatedIdentifier(null);
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        {createdIdentifier ? (
          <>
            <div className="flex flex-col items-center pt-2 text-center">
              <div className="bg-brand/10 mb-3 flex size-10 items-center justify-center rounded-full">
                <CircleCheck className="size-5 text-brand" />
              </div>
              <DialogHeader className="items-center">
                <DialogTitle>Agent created</DialogTitle>
                <DialogDescription>
                  Use this identifier to select the agent in the SDK.
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="py-2">
              <div className="bg-muted flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
                <code className="min-w-0 truncate font-mono text-sm font-medium">
                  {createdIdentifier}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => copy(createdIdentifier)}
                >
                  {copied ? (
                    <Check className="size-3.5 text-brand" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)} className="w-full">
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create agent</DialogTitle>
              <DialogDescription>
                Give your agent a name to identify it in the dashboard.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Name</Label>
                <Input
                  id="agent-name"
                  placeholder="e.g. Production Claude"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim() && isValidIdentifier)
                      handleCreate();
                  }}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-identifier">Identifier</Label>
                <Input
                  id="agent-identifier"
                  placeholder="e.g. production"
                  value={identifier}
                  onChange={(e) => handleIdentifierChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim() && isValidIdentifier)
                      handleCreate();
                  }}
                />
                <p
                  className={`text-xs ${identifier && !isValidIdentifier ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {identifier && !isValidIdentifier
                    ? "Must start with a letter and contain only lowercase letters, numbers, and hyphens."
                    : "Used to select this agent in the SDK. Lowercase letters, numbers, and hyphens."}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                loading={creating}
                disabled={!name.trim() || !isValidIdentifier}
              >
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Agent Card ────────────────────────────────────────────────────────

const AgentCard = ({
  agent,
  onUpdate,
}: {
  agent: Agent;
  onUpdate: () => void;
}) => {
  const [deleting, setDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [rotateDialogOpen, setRotateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [secretsDialogOpen, setSecretsDialogOpen] = useState(false);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await api.api.agents({ agentId: agent.id })["regenerate-token"].post();
      onUpdate();
      toast.success("Token regenerated");
    } catch {
      toast.error("Failed to regenerate token");
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.api.agents({ agentId: agent.id }).delete();
      onUpdate();
      toast.success("Agent deleted");
    } catch {
      toast.error("Failed to delete agent");
    } finally {
      setDeleting(false);
    }
  };

  const handleRename = async () => {
    if (!newName.trim()) return;
    setRenaming(true);
    try {
      await api.api.agents({ agentId: agent.id }).patch({ name: newName });
      onUpdate();
      setRenameDialogOpen(false);
      toast.success("Agent renamed");
    } catch {
      toast.error("Failed to rename agent");
    } finally {
      setRenaming(false);
    }
  };

  const secretsLabel =
    agent.secretMode === "selective"
      ? `${agent._count.agentSecrets} ${agent._count.agentSecrets === 1 ? "secret" : "secrets"}`
      : "All secrets";

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{agent.name}</h3>
            {agent.isDefault && (
              <Badge variant="outline" className="text-xs">
                Default
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {agent.identifier && (
              <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono">
                {agent.identifier}
              </code>
            )}
            <span className="text-muted-foreground">
              Created {new Date(agent.createdAt).toLocaleDateString()}
            </span>
            <button
              type="button"
              onClick={() => setSecretsDialogOpen(true)}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
            >
              <KeyRound className="size-3" />
              {secretsLabel}
            </button>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setNewName(agent.name);
                setRenameDialogOpen(true);
              }}
            >
              <Pencil className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSecretsDialogOpen(true)}>
              <KeyRound className="size-4" />
              Manage secrets
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setRotateDialogOpen(true)}>
              <RotateCw className="size-4" />
              Rotate token
            </DropdownMenuItem>
            {!agent.isDefault && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="size-4" />
                Delete agent
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={rotateDialogOpen} onOpenChange={setRotateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate token?</AlertDialogTitle>
            <AlertDialogDescription>
              The current token for <strong>{agent.name}</strong> will be
              invalidated immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              {regenerating ? "Rotating..." : "Rotate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{agent.name}</strong> and its
              access token.
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

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor={`rename-agent-${agent.id}`}>Name</Label>
            <Input
              id={`rename-agent-${agent.id}`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) handleRename();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              loading={renaming}
              disabled={!newName.trim()}
            >
              {renaming ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManageSecretsDialog
        agent={agent}
        open={secretsDialogOpen}
        onOpenChange={setSecretsDialogOpen}
        onUpdated={onUpdate}
      />
    </Card>
  );
};

// ── Agents Page ───────────────────────────────────────────────────────

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchAgents = useCallback(async () => {
    const { data } = await api.api.agents.get();
    if (data) setAgents(data as Agent[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 max-w-5xl">
        <PageHeader
          title="Agents"
          description="Manage agents that connect to the gateway and receive injected credentials."
        />
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i} className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
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
        title="Agents"
        description="Manage agents that connect to the gateway and receive injected credentials."
      />
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            Create Agent
          </Button>
        </div>
        {agents.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-muted mb-4 flex size-12 items-center justify-center rounded-full">
              <Bot className="text-muted-foreground size-6" />
            </div>
            <p className="text-sm font-medium">No agents yet</p>
            <p className="text-muted-foreground mt-1 max-w-xs text-xs">
              Create an agent to generate an access token for connecting to the
              gateway.
            </p>
          </Card>
        ) : (
          agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onUpdate={fetchAgents} />
          ))
        )}
        <CreateAgentDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={fetchAgents}
        />
      </div>
    </div>
  );
}
