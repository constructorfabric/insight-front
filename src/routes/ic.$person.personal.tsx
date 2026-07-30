import { createFileRoute } from "@tanstack/react-router";

import { DashboardScreen } from "@/screens/dashboard";

export const Route = createFileRoute("/ic/$person/personal")({
  component: PersonalRoute,
});

function PersonalRoute() {
  const { person } = Route.useParams();
  return <DashboardScreen personId={person} />;
}
