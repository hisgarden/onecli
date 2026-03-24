import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Bot,
  Shield,
  KeyRound,
  Settings,
  Code,
  Moon,
  Sun,
  ChevronsUpDown,
  LogOut,
  User,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@onecli/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@onecli/ui/components/tooltip";
import { Avatar, AvatarFallback } from "@onecli/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@onecli/ui/components/dropdown-menu";
import { Separator } from "@onecli/ui/components/separator";
import { cn } from "@onecli/ui/lib/utils";
import { TryDemoButton } from "./try-demo-button";

// ── Nav Items ─────────────────────────────────────────────────────────

const navItems = [
  { title: "Overview", to: "/overview", icon: LayoutDashboard },
  { title: "Agents", to: "/agents", icon: Bot },
  { title: "Rules", to: "/rules", icon: Shield },
  { title: "Secrets", to: "/secrets", icon: KeyRound },
  { title: "Settings", to: "/settings", icon: Settings },
];

const settingsSections = [
  {
    label: "Account",
    items: [
      { title: "Profile", to: "/settings/profile", icon: User },
      { title: "API Keys", to: "/settings/api-keys", icon: KeyRound },
    ],
  },
  {
    label: "Security",
    items: [
      { title: "Encryption", to: "/settings/encryption", icon: ShieldCheck },
    ],
  },
];

// ── User Menu ─────────────────────────────────────────────────────────

const NavUser = () => {
  const { user, signOut } = useAuth();
  const displayName = user?.name ?? user?.email ?? "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent/50 transition-colors">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{displayName}</span>
            <span className="truncate text-xs text-muted-foreground">
              {user?.email}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-muted-foreground text-xs leading-none">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// ── Settings Nav ──────────────────────────────────────────────────────

const SettingsNav = () => {
  const { pathname } = useLocation();

  return (
    <nav className="space-y-5">
      {settingsSections.map((section) => (
        <div key={section.label} className="space-y-1">
          <p className="text-muted-foreground px-2 pb-1 text-xs font-medium">
            {section.label}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const isActive = pathname === item.to;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
                      isActive
                        ? "bg-brand/10 font-medium text-brand hover:bg-brand/15"
                        : "text-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
};

// ── Dashboard Layout ──────────────────────────────────────────────────

export function DashboardLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const isSettings = pathname.startsWith("/settings");

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-brand h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
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
    <div className="bg-sidebar flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col border-r">
        <div className="h-12 flex items-center px-4 border-b">
          <a
            href="https://onecli.sh"
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-semibold"
          >
            OneCLI
          </a>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-brand/10 font-medium text-brand"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </NavLink>
          ))}
        </nav>
        <div className="p-2 border-t">
          <NavUser />
        </div>
      </aside>

      {/* Main content area */}
      <div className="bg-background flex-1 flex flex-col overflow-hidden md:rounded-xl md:m-1 md:ml-0 md:border">
        {/* Header */}
        <header className="flex h-12 shrink-0 items-center border-b px-4">
          <div className="ml-auto flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" asChild>
                  <a
                    href="https://www.onecli.sh/docs/sdks/overview"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Code className="size-3.5" />
                    SDKs
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Learn how to connect OneCLI to your agent
              </TooltipContent>
            </Tooltip>
            <TryDemoButton />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleTheme}>
                  <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  <span className="sr-only">Toggle theme</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Page content */}
        <div className="flex min-h-0 flex-1">
          {isSettings && (
            <aside className="hidden w-56 shrink-0 overflow-y-auto border-r px-6 pt-6 md:block">
              <SettingsNav />
            </aside>
          )}
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
