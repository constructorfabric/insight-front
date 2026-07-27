import { Check, ChevronDown } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { setPortalScope, usePortalScope } from "@/lib/portal/portal-store";
import { useOrgScope } from "@/lib/portal/use-org-scope";
import { cn } from "@/lib/utils";

/**
 * Global org-scope control (design §6): pick any manager node of the viewer's
 * subtree; optionally narrow to direct reports. The active scope is the frame
 * every org zone (Overview / Directions / AI & Cost / People) computes in.
 *
 * `pivotEmail` and `managerNodes[].email` both come from the same identity
 * tree walk in `useOrgScope` (see use-org-scope.ts), so they carry the same
 * raw casing — a plain `===` is safe without lowercasing.
 */
export function ScopeSelect() {
  const scope = usePortalScope();
  const { label, count, managerNodes, pivotEmail, canDirectOnly } = useOrgScope();
  if (!managerNodes.length) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm shadow-xs hover:bg-accent"
          >
            <span className="text-muted-foreground">Scope:</span>
            <span className="max-w-40 truncate font-medium">{label}</span>
            <span className="text-muted-foreground">· {count}</span>
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          </button>
        }
      />
      <PopoverContent align="end" className="w-72 p-1">
        <div className="max-h-80 overflow-y-auto">
          {managerNodes.map((m) => (
            <button
              key={m.email}
              type="button"
              onClick={() => setPortalScope({ root: m.depth === 0 ? null : m.email })}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                m.email === pivotEmail && "bg-accent/60",
              )}
              style={{ paddingLeft: `${0.5 + m.depth * 0.875}rem` }}
            >
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <span className="text-xs text-muted-foreground">{m.teamSize}</span>
              {m.email === pivotEmail ? <Check className="size-4" aria-hidden /> : null}
            </button>
          ))}
        </div>
        {canDirectOnly ? (
          <label className="flex cursor-pointer items-center justify-between gap-2 border-t px-2 py-2 text-sm select-none">
            <span>Direct reports only</span>
            <Switch
              checked={scope.directOnly}
              onCheckedChange={(v) => setPortalScope({ directOnly: v })}
            />
          </label>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
