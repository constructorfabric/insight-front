import { createFileRoute } from "@tanstack/react-router";

import { useViewer } from "@/auth";
import { LegacyPersonRedirect } from "@/components/legacy-person-redirect";
import { isPersonId } from "@/lib/metrics/entity";
import { TeamViewScreen } from "@/screens/team-view";

export const Route = createFileRoute("/ic/$person/team")({
  component: TeamScreen,
});

function TeamScreen() {
  const { person } = Route.useParams();
  const { personId: viewerPersonId } = useViewer();
  if (!isPersonId(person)) {
    return <LegacyPersonRedirect email={person} view="team" />;
  }
  // The viewer's own id is the pivot's fallback: a team view always has a
  // person whose subtree it shows.
  return <TeamViewScreen teamId={person} viewerPersonId={viewerPersonId ?? person} />;
}
