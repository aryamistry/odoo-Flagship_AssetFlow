import { Navigate, Route, Routes, useLocation } from "react-router";
import { AppShell } from "./AppShell";
import { useAuth } from "../features/auth/AuthProvider";
import { LoginPage, SignupPage } from "../features/auth/AuthPages";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import {
  AssetsPage,
  AssetDetailPage,
  NewAssetPage,
} from "../features/assets/AssetPages";
import {
  EmployeesPage,
  OrganizationSetupPage,
} from "../features/organization/OrganizationPages";
import {
  AllocationsPage,
  MaintenancePage,
  TransfersPage,
} from "../features/workflows/WorkflowPages";
import { BookingsPage } from "../features/bookings/BookingsPage";
import { AuditsPage, AuditDetailPage } from "../features/audits/AuditPages";
import { ReportsPage } from "../features/reports/ReportsPage";
import { NotificationsPage } from "../features/notifications/NotificationsPage";
import { Loading } from "../components/ui";
function Protected() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading)
    return (
      <main className="center">
        <Loading />
      </main>
    );
  if (!auth.user)
    return <Navigate to="/login" replace state={{ from: location }} />;
  return <AppShell />;
}
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<Protected />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/assets/new" element={<NewAssetPage />} />
        <Route path="/assets/:id" element={<AssetDetailPage />} />
        <Route path="/allocations" element={<AllocationsPage />} />
        <Route path="/transfers" element={<TransfersPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/audits" element={<AuditsPage />} />
        <Route path="/audits/:id" element={<AuditDetailPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route
          path="/organization/departments"
          element={<OrganizationSetupPage />}
        />
        <Route
          path="/organization/locations"
          element={<OrganizationSetupPage />}
        />
        <Route
          path="/organization/categories"
          element={<OrganizationSetupPage />}
        />
        <Route path="/organization/employees" element={<EmployeesPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
