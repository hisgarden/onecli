import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import { AppRouter } from "@/routes";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <AppRouter />
      <Toaster richColors position="bottom-right" />
    </AuthProvider>
  </StrictMode>,
);
