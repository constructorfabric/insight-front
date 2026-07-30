import { createFileRoute, Outlet } from "@tanstack/react-router";

import { validatePortalSearch } from "@/lib/portal/portal-search";

export const Route = createFileRoute("/ic/$person")({
  // Person and People are portal zones too: the scope, slice and period a
  // reader picked must survive the drill into a person and the climb back out.
  validateSearch: validatePortalSearch,
  component: () => <Outlet />,
});
