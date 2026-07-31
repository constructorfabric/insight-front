import { createFileRoute } from "@tanstack/react-router";

import { DashboardScreen } from "@/screens/dashboard";
import { LegacyPersonRedirect } from "@/components/legacy-person-redirect";
import { isPersonId } from "@/lib/metrics/entity";

export const Route = createFileRoute("/ic/$person/personal")({
  component: PersonalRoute,
});

function PersonalRoute() {
  const { person } = Route.useParams();
  // `$person` is a canonical person id since the identity cutover. A shared or
  // bookmarked email URL still has to work, so it is migrated to the person-id
  // URL rather than sent to the metrics API, where an email is a 400 the user
  // cannot act on.
  if (!isPersonId(person)) {
    return <LegacyPersonRedirect email={person} view="personal" />;
  }
  return <DashboardScreen personId={person} />;
}
