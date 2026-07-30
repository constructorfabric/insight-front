import { createFileRoute } from "@tanstack/react-router";

import { PortalLayout } from "@/components/portal/portal-layout";
import { validatePortalSearch } from "@/lib/portal/portal-search";

/**
 * The portal's org zones (Overview / Directions / AI & Cost / Manage).
 *
 * Person and People are NOT here: they are about one person, so they keep
 * their own `/ic/$person/*` routes and carry the same search params. The zone
 * therefore comes from the route on those, and from `?zone=` here.
 */
export const Route = createFileRoute("/portal")({
  validateSearch: validatePortalSearch,
  component: PortalLayout,
});
