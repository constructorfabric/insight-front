import { createFileRoute } from "@tanstack/react-router";

import { useViewer } from "@/auth";
import { FullScreenLoading } from "@/components/full-screen-loading";
import { DashboardScreen } from "@/screens/dashboard";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute() {
  const { email } = useViewer();
  // An authenticated session always carries an email; the loading fallback
  // only shows in the brief window before the store resolves.
  if (!email) return <FullScreenLoading />;
  return <DashboardScreen personId={email} />;
}
