import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@onecli/ui/components/card";
import { Button } from "@onecli/ui/components/button";
import { Input } from "@onecli/ui/components/input";
import { Label } from "@onecli/ui/components/label";
import { Skeleton } from "@onecli/ui/components/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onecli/ui/components/select";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";

// ── Profile Form ──────────────────────────────────────────────────────

const ProfileForm = () => {
  const [name, setName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.api.user.get().then(({ data }) => {
      if (data && "email" in data) {
        const u = data as { name?: string | null; email: string };
        setName(u.name ?? "");
        setInitialName(u.name ?? "");
        setEmail(u.email ?? "");
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.api.user.patch({ name });
      setInitialName(name);
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="grid gap-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Info</CardTitle>
        <CardDescription>Update your display name.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={email} disabled />
          <p className="text-muted-foreground text-xs">
            Email is managed by your Google account.
          </p>
        </div>
        <Button
          onClick={handleSave}
          loading={saving}
          disabled={name === initialName}
          className="w-fit"
        >
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
};

// ── Key Management Card ───────────────────────────────────────────────

const KeyManagementCard = () => (
  <Card>
    <CardHeader>
      <CardTitle>Key Management</CardTitle>
      <CardDescription>
        Select which Key Management System to use for encrypting your project
        data
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <Select defaultValue="default">
        <SelectTrigger className="w-full max-w-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">Default OneCLI KMS</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="secondary" className="w-fit" disabled>
        Save
      </Button>
    </CardContent>
  </Card>
);

// ── Settings Profile Page ─────────────────────────────────────────────

export function SettingsProfilePage() {
  return (
    <div className="flex flex-1 flex-col gap-4 max-w-5xl">
      <PageHeader
        title="Profile"
        description="Manage your personal information."
      />
      <ProfileForm />
      <KeyManagementCard />
    </div>
  );
}
