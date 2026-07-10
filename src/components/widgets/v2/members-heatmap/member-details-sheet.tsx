import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  applyFocus,
  PEER_LABEL,
  PEER_TEXT,
  type PeerStatusWithNeutral,
} from "@/lib/peers";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/types/insight";

export interface MemberDetailRow {
  /** Stable identity (metric key) — labels can repeat across sources. */
  key: string;
  label: string;
  /** Preformatted value — sources format differently (legacy vs unified). */
  display: string;
  medianDisplay: string | null;
  status: PeerStatusWithNeutral;
}

export interface MemberDetailsSheetProps {
  member: TeamMember | null;
  rows: MemberDetailRow[];
  onOpenChange: (open: boolean) => void;
}

export function MemberDetailsSheet({
  member,
  rows,
  onOpenChange,
}: MemberDetailsSheetProps) {
  const { focusMode } = useSettings();
  const open = member !== null;
  const below = rows.filter((r) => r.status === "bottom");
  const top = rows.filter((r) => r.status === "top");
  const inPack = rows.filter(
    (r) => r.status === "in_pack" || r.status === "neutral",
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-xl"
      >
        {member ? (
          <>
            <SheetHeader>
              <SheetTitle>{member.name}</SheetTitle>
              {member.seniority ? (
                <SheetDescription>{member.seniority}</SheetDescription>
              ) : null}
            </SheetHeader>
            <div className="flex flex-col gap-6 px-4 pb-6">
              {below.length > 0 ? (
                <Bucket
                  title="Needs attention"
                  status="bottom"
                  rows={below}
                  focusMode={focusMode}
                />
              ) : null}
              {top.length > 0 ? (
                <Bucket
                  title="Strong points"
                  status="top"
                  rows={top}
                  focusMode={focusMode}
                />
              ) : null}
              {inPack.length > 0 ? (
                <Bucket
                  title="On par"
                  status="in_pack"
                  rows={inPack}
                  focusMode={focusMode}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Bucket({
  title,
  status,
  rows,
  focusMode,
}: {
  title: string;
  status: PeerStatusWithNeutral;
  rows: MemberDetailRow[];
  focusMode: "all" | "critical" | "rewards" | "neutral";
}) {
  const focused = applyFocus(status, focusMode);
  return (
    <section className="flex flex-col gap-2">
      <p className={cn("text-xs font-medium uppercase tracking-wider", PEER_TEXT[focused])}>
        {title}
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.key}
            className="flex items-baseline justify-between gap-3 rounded-md border px-3 py-2"
          >
            <span className="min-w-0 truncate text-sm">{r.label}</span>
            <span className="flex shrink-0 items-baseline gap-2 text-sm">
              <span className="font-medium tabular-nums">{r.display}</span>
              {r.medianDisplay != null ? (
                <span className="text-xs text-muted-foreground">
                  median {r.medianDisplay}
                </span>
              ) : null}
              <span className={cn("text-xs", PEER_TEXT[focused])}>
                {PEER_LABEL[focused]}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
