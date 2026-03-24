import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  ShieldOff,
  Pencil,
  Trash2,
  ShieldBan,
  Gauge,
  Check,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@onecli/ui/components/card";
import { Button } from "@onecli/ui/components/button";
import { Badge } from "@onecli/ui/components/badge";
import { Input } from "@onecli/ui/components/input";
import { Label } from "@onecli/ui/components/label";
import { Checkbox } from "@onecli/ui/components/checkbox";
import { Switch } from "@onecli/ui/components/switch";
import { Skeleton } from "@onecli/ui/components/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@onecli/ui/components/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onecli/ui/components/select";
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

// ── Types ─────────────────────────────────────────────────────────────

interface PolicyRule {
  id: string;
  name: string;
  hostPattern: string;
  pathPattern: string | null;
  method: string | null;
  action: string;
  enabled: boolean;
  agentId: string | null;
  rateLimit: number | null;
  rateLimitWindow: string | null;
  createdAt: string;
}

interface AgentOption {
  id: string;
  name: string;
}

const METHOD_OPTIONS = [
  { value: "", label: "All methods" },
  { value: "GET", label: "GET" },
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
  { value: "PATCH", label: "PATCH" },
  { value: "DELETE", label: "DELETE" },
] as const;

const STEPS = [
  {
    id: "endpoint" as const,
    label: "Endpoint",
    description: "Choose which requests this rule applies to.",
  },
  {
    id: "action" as const,
    label: "Action",
    description: "Decide what happens when a request matches.",
  },
];

type Step = "endpoint" | "action";

// ── Rule Dialog ───────────────────────────────────────────────────────

const RuleDialog = ({
  open,
  onOpenChange,
  onSaved,
  agents,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  agents: AgentOption[];
  rule?: PolicyRule;
}) => {
  const isEdit = !!rule;
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>("endpoint");
  const [name, setName] = useState("");
  const [hostPattern, setHostPattern] = useState("");
  const [pathPattern, setPathPattern] = useState("");
  const [method, setMethod] = useState("");
  const [agentId, setAgentId] = useState("");
  const [action, setAction] = useState<"block" | "rate_limit">("block");
  const [rateLimit, setRateLimit] = useState(100);
  const [rateLimitWindow, setRateLimitWindow] = useState<
    "minute" | "hour" | "day"
  >("hour");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (open) {
      setStep("endpoint");
      setName(rule?.name ?? "");
      setHostPattern(rule?.hostPattern ?? "");
      setPathPattern(rule?.pathPattern ?? "");
      setMethod(rule?.method ?? "");
      setAgentId(rule?.agentId ?? "");
      setAction((rule?.action as "block" | "rate_limit") ?? "block");
      setRateLimit(rule?.rateLimit ?? 100);
      setRateLimitWindow(
        (rule?.rateLimitWindow as "minute" | "hour" | "day") ?? "hour",
      );
      setEnabled(rule?.enabled ?? true);
    }
  }, [open, rule]);

  const isEndpointValid = !!(name.trim() && hostPattern.trim());
  const isActionValid =
    action !== "rate_limit" || (rateLimit > 0 && rateLimitWindow);
  const isValid = isEndpointValid && isActionValid;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        hostPattern: hostPattern.trim(),
        pathPattern: pathPattern.trim() || null,
        method: method || null,
        agentId: agentId || null,
        action,
        rateLimit: action === "rate_limit" ? rateLimit : null,
        rateLimitWindow: action === "rate_limit" ? rateLimitWindow : null,
      };
      if (isEdit) {
        await api.api.rules({ ruleId: rule.id }).patch(payload);
        toast.success("Rule updated");
      } else {
        await api.api.rules.post({ ...payload, enabled });
        toast.success("Rule created");
      }
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error(isEdit ? "Failed to update rule" : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit rule" : "New rule"}</DialogTitle>
          <DialogDescription>
            {STEPS.find((s) => s.id === step)!.description}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center">
          {STEPS.map((s, i) => {
            const isCurrent = step === s.id;
            const isCompleted =
              s.id === "endpoint" && step === "action" && isEndpointValid;
            const isClickable =
              s.id === "endpoint" || (s.id === "action" && isEndpointValid);
            return (
              <div key={s.id} className="flex items-center">
                {i > 0 && (
                  <div
                    className={`mx-3 h-px w-10 ${isCompleted || isCurrent ? "bg-brand/30" : "bg-border"}`}
                  />
                )}
                <button
                  type="button"
                  onClick={() => isClickable && setStep(s.id)}
                  disabled={!isClickable}
                  className="flex items-center gap-2.5 disabled:cursor-default"
                >
                  <span
                    className={`flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${isCurrent ? "bg-brand text-brand-foreground" : isCompleted ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"}`}
                  >
                    {isCompleted ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span
                    className={`text-sm ${isCurrent ? "text-foreground font-medium" : isCompleted ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {s.label}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Step 1: Endpoint */}
        {step === "endpoint" && (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                placeholder="e.g. Limit Anthropic calls"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rule-host">Host pattern</Label>
                <Input
                  id="rule-host"
                  placeholder="e.g. api.anthropic.com"
                  value={hostPattern}
                  onChange={(e) => setHostPattern(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Use <code className="text-xs">*.example.com</code> for
                  wildcard subdomains.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-path">
                  Path pattern{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="rule-path"
                  placeholder="e.g. /v1/messages"
                  value={pathPattern}
                  onChange={(e) => setPathPattern(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Use <code className="text-xs">/path/*</code> for prefix
                  matching.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Method</Label>
                <Select
                  value={method || "_all"}
                  onValueChange={(v) => setMethod(v === "_all" ? "" : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHOD_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value || "_all"}
                        value={opt.value || "_all"}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select
                  value={agentId || "_all"}
                  onValueChange={(v) => setAgentId(v === "_all" ? "" : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All agents</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Action */}
        {step === "action" && (
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAction("block")}
                className={`flex flex-col gap-1.5 rounded-md border p-3.5 text-left transition-colors ${action === "block" ? "border-brand bg-brand/5" : "hover:bg-muted/50"}`}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ShieldBan
                    className={`size-4 ${action === "block" ? "text-brand" : ""}`}
                  />
                  Block
                </span>
                <span className="text-muted-foreground text-xs">
                  Deny the request entirely
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAction("rate_limit")}
                className={`flex flex-col gap-1.5 rounded-md border p-3.5 text-left transition-colors ${action === "rate_limit" ? "border-brand bg-brand/5" : "hover:bg-muted/50"}`}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Gauge
                    className={`size-4 ${action === "rate_limit" ? "text-brand" : ""}`}
                  />
                  Rate Limit
                </span>
                <span className="text-muted-foreground text-xs">
                  Allow up to N requests, then block
                </span>
              </button>
            </div>
            {action === "rate_limit" && (
              <div className="space-y-2.5 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={1000000}
                    value={rateLimit}
                    onChange={(e) =>
                      setRateLimit(parseInt(e.target.value) || 1)
                    }
                    className="h-8 w-24"
                  />
                  <span className="text-muted-foreground text-xs">
                    requests per
                  </span>
                  <Select
                    value={rateLimitWindow}
                    onValueChange={(v) =>
                      setRateLimitWindow(v as "minute" | "hour" | "day")
                    }
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minute">minute</SelectItem>
                      <SelectItem value="hour">hour</SelectItem>
                      <SelectItem value="day">day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-muted-foreground text-[11px] leading-snug">
                  Each agent tracks its own counter. Excess requests return 429.
                </p>
              </div>
            )}
            <Accordion type="single" collapsible className="border-none">
              <AccordionItem value="advanced" className="border-t border-b-0">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <span className="text-muted-foreground flex items-center gap-2 text-xs font-normal">
                    <Settings2 className="size-3.5" />
                    Advanced settings
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-0">
                  {!isEdit && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="rule-enabled"
                        checked={enabled}
                        onCheckedChange={(checked) =>
                          setEnabled(checked === true)
                        }
                      />
                      <Label
                        htmlFor="rule-enabled"
                        className="text-sm font-normal"
                      >
                        Enable rule immediately
                      </Label>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}

        <DialogFooter>
          {step === "endpoint" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep("action")}
                disabled={!isEndpointValid}
              >
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("endpoint")}>
                Back
              </Button>
              <Button onClick={handleSave} loading={saving} disabled={!isValid}>
                {saving
                  ? isEdit
                    ? "Saving..."
                    : "Creating..."
                  : isEdit
                    ? "Save Changes"
                    : "Create Rule"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Rule Card ─────────────────────────────────────────────────────────

const RuleCard = ({
  rule,
  agents,
  onUpdate,
}: {
  rule: PolicyRule;
  agents: AgentOption[];
  onUpdate: () => void;
}) => {
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  const agentName = rule.agentId
    ? agents.find((a) => a.id === rule.agentId)?.name
    : null;
  const actionLabel = rule.action === "rate_limit" ? "rate limit" : rule.action;
  const rateLimitLabel =
    rule.action === "rate_limit" && rule.rateLimit && rule.rateLimitWindow
      ? `${rule.rateLimit}/${{ minute: "min", hour: "hr", day: "day" }[rule.rateLimitWindow] ?? rule.rateLimitWindow}`
      : null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.api.rules({ ruleId: rule.id }).delete();
      onUpdate();
      toast.success("Rule deleted");
    } catch {
      toast.error("Failed to delete rule");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    setToggling(true);
    try {
      await api.api.rules({ ruleId: rule.id }).patch({ enabled });
      onUpdate();
    } catch {
      toast.error("Failed to update rule");
    } finally {
      setToggling(false);
    }
  };

  return (
    <>
      <Card
        className={`p-5 transition-opacity ${!rule.enabled ? "opacity-50" : ""}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">{rule.name}</h3>
              <Badge
                variant={
                  rule.action === "rate_limit" ? "secondary" : "destructive"
                }
                className={`text-xs ${rule.action === "rate_limit" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : ""}`}
              >
                {actionLabel}
              </Badge>
              {rule.method && (
                <Badge variant="outline" className="font-mono text-xs">
                  {rule.method}
                </Badge>
              )}
              {rateLimitLabel && (
                <Badge
                  variant="outline"
                  className="text-muted-foreground text-xs"
                >
                  {rateLimitLabel}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">
                Host:{" "}
                <code className="bg-muted rounded px-1 py-0.5 font-mono">
                  {rule.hostPattern}
                </code>
              </span>
              {rule.pathPattern && (
                <span className="text-muted-foreground">
                  Path:{" "}
                  <code className="bg-muted rounded px-1 py-0.5 font-mono">
                    {rule.pathPattern}
                  </code>
                </span>
              )}
              <span className="text-muted-foreground">
                Scope:{" "}
                {agentName ? (
                  <span className="text-foreground">{agentName}</span>
                ) : (
                  "All agents"
                )}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={rule.enabled}
              onCheckedChange={handleToggle}
              disabled={toggling}
              aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
            />
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
                  <AlertDialogTitle>Delete rule?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <strong>{rule.name}</strong>.
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
      <RuleDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        rule={rule}
        agents={agents}
        onSaved={onUpdate}
      />
    </>
  );
};

// ── Rules Page ────────────────────────────────────────────────────────

export function RulesPage() {
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchRules = useCallback(async () => {
    const { data } = await api.api.rules.get();
    if (data) setRules(data as PolicyRule[]);
    setLoading(false);
  }, []);

  const fetchAgents = useCallback(async () => {
    const { data } = await api.api.agents.get();
    if (data)
      setAgents(
        (data as { id: string; name: string }[]).map((a) => ({
          id: a.id,
          name: a.name,
        })),
      );
  }, []);

  useEffect(() => {
    fetchRules();
    fetchAgents();
  }, [fetchRules, fetchAgents]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 max-w-5xl">
        <PageHeader
          title="Rules"
          description="Control what your agents can and cannot access."
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
                  <Skeleton className="h-5 w-9 rounded-full" />
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
        title="Rules"
        description="Control what your agents can and cannot access."
      />
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            New Rule
          </Button>
        </div>
        {rules.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-amber-500/10">
              <ShieldOff className="size-6 text-amber-500" />
            </div>
            <p className="text-sm font-medium">YOLO mode</p>
            <p className="text-muted-foreground mt-1 max-w-xs text-xs">
              Your agents have unrestricted access to all assigned secrets. Add
              a rule to block specific endpoints or set boundaries.
            </p>
          </Card>
        ) : (
          rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              agents={agents}
              onUpdate={fetchRules}
            />
          ))
        )}
        <RuleDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSaved={fetchRules}
          agents={agents}
        />
      </div>
    </div>
  );
}
