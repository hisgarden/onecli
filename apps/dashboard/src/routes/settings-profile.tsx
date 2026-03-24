import { useAuth } from "@/lib/auth";

export function SettingsProfilePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      {user ? (
        <div className="rounded-lg border bg-card p-6 space-y-2">
          <p>
            <span className="text-muted-foreground">Name:</span>{" "}
            {user.name ?? "-"}
          </p>
          <p>
            <span className="text-muted-foreground">Email:</span> {user.email}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground">Loading...</p>
      )}
    </div>
  );
}
