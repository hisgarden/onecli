import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, Bot, Shield, KeyRound, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth";

const navItems = [
  { title: "Overview", to: "/overview", icon: LayoutDashboard },
  { title: "Agents", to: "/agents", icon: Bot },
  { title: "Rules", to: "/rules", icon: Shield },
  { title: "Secrets", to: "/secrets", icon: KeyRound },
  { title: "Settings", to: "/settings", icon: Settings },
];

export function DashboardLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Not authenticated</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-60 border-r bg-sidebar flex flex-col">
        <div className="p-4 border-b">
          <span className="text-lg font-semibold">OneCLI</span>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
