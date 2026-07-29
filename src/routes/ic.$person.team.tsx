import { createFileRoute } from "@tanstack/react-router";

import { useViewer } from "@/auth";
import { TeamViewScreen } from "@/screens/team-view";

export const Route = createFileRoute("/ic/$person/team")({
  component: TeamScreen,
});

function TeamScreen() {
  const { person } = Route.useParams();
  const { email: viewerEmail } = useViewer();
  const viewer = viewerEmail ?? person;
  return <TeamViewScreen teamId={person} viewerEmail={viewer} />;
}
