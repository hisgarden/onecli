import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard-layout";
import { OverviewPage } from "@/routes/overview";
import { AgentsPage } from "@/routes/agents";
import { SecretsPage } from "@/routes/secrets";
import { RulesPage } from "@/routes/rules";
import { SettingsProfilePage } from "@/routes/settings-profile";
import { SettingsApiKeysPage } from "@/routes/settings-api-keys";
import { SettingsEncryptionPage } from "@/routes/settings-encryption";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route element={<DashboardLayout />}>
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/secrets" element={<SecretsPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route
            path="/settings"
            element={<Navigate to="/settings/profile" replace />}
          />
          <Route path="/settings/profile" element={<SettingsProfilePage />} />
          <Route path="/settings/api-keys" element={<SettingsApiKeysPage />} />
          <Route
            path="/settings/encryption"
            element={<SettingsEncryptionPage />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
