import { ComingSoon } from "@/components/widgets/coming-soon";
import { CollaborationLensView } from "@/components/portal/collaboration-view";
import { RichDomainView } from "@/components/portal/rich-domain-view";
import type { GroupId } from "@/lib/insight/groups";
import { DIRECTIONS } from "@/lib/portal/nav-model";

/**
 * Which lenses of each direction are backed by real metric groups. A lens that
 * maps here renders a focused domain roster (RichDomainView over just those
 * groups); every other declared lens is an honest ComingSoon — the finer facets
 * (Flow, Quality, Repositories, …) aren't in the semantic layer yet, so we
 * don't fake a distinct view. Mirrors the Overview / AI & Cost approach:
 * real where data exists, explicit ComingSoon otherwise.
 */
const REAL_LENSES: Record<string, Record<string, readonly GroupId[]>> = {
  dev: {
    Overview: ["git_output", "task_delivery"],
    "Git output": ["git_output"],
    Delivery: ["task_delivery"],
  },
  // collab is handled entirely by CollaborationLensView (returns early below).
  wiki: { Overview: ["wiki"] },
};

/**
 * Directions content — routes the active lens to a real focused domain view or
 * an honest ComingSoon. Period + slice come from the global bar; RichDomainView
 * is already cohort-aware, so lenses inherit slicing for free.
 */
export function DirectionView({
  scopePerson,
  dir,
  lens,
}: {
  scopePerson: string;
  dir: string;
  lens: string;
}) {
  const direction = DIRECTIONS.find((d) => d.id === dir);
  const name = direction?.name ?? "Direction";
  const groups = REAL_LENSES[dir]?.[lens];

  // Collaboration's lenses are purpose-built trend & balance screens, not the
  // generic totals + composition template (which carries no signal for a comms
  // domain). The lens router picks the right modality config, or an honest
  // ComingSoon for a lens that isn't a distinct metric family.
  if (dir === "collab") {
    return <CollaborationLensView scopePerson={scopePerson} lens={lens} />;
  }

  if (groups) {
    // Domain "what's it made of" breakdown + domain-specific health tiles,
    // where the data supports it.
    let composition: { metricKey: string; dimension: string; title: string } | undefined;
    if (groups.includes("git_output")) {
      composition = { metricKey: "git.lines_added", dimension: "category", title: "Lines by category" };
    }
    return (
      <RichDomainView
        scopePerson={scopePerson}
        groupIds={groups}
        title={lens === "Overview" ? name : `${name} · ${lens}`}
        composition={composition}
      />
    );
  }

  const reason =
    direction?.source === "bullet"
      ? `${name} is a bullet-only direction — its connector (${direction.connectors.join(", ")}) isn't in the semantic layer yet.`
      : `“${lens}” — this facet isn't a distinct metric family in the semantic layer yet. See ${name} → Overview for what's measured today.`;

  return (
    <div className="mx-auto w-full max-w-md p-8">
      <ComingSoon variant="card" state="empty" label={reason} />
    </div>
  );
}
