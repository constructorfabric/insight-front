import { createFileRoute } from "@tanstack/react-router";

import { LegacyPersonRedirect } from "@/components/legacy-person-redirect";
import { isPersonId } from "@/lib/metrics/entity";
import { TeamViewScreen } from "@/screens/team-view";

export const Route = createFileRoute("/ic/$person/team")({
  component: TeamScreen,
});

function TeamScreen() {
  const { person } = Route.useParams();
  if (!isPersonId(person)) {
    return <LegacyPersonRedirect email={person} view="team" />;
  }
  return <TeamViewScreen teamId={person} />;
}
