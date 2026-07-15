import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  Megaphone,
  User,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useViewer } from "@/auth";
import { DevImpersonationHint } from "@/components/dev-impersonation-hint";
import { SidebarV2Settings } from "@/components/sidebar-v2-settings";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { getInitials } from "@/lib/insight/get-initials";
import { useIcPerson } from "@/queries/ic-dashboard";
import type { IdentityPerson } from "@/types/insight";

function emailEq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function containsEmail(node: IdentityPerson, email: string): boolean {
  if (emailEq(node.email, email)) return true;
  return node.subordinates.some((s) => containsEmail(s, email));
}

function PersonNode({
  node,
  depth,
  activeEmail,
}: {
  node: IdentityPerson;
  depth: number;
  activeEmail: string | null;
}) {
  const hasReports = node.subordinates.length > 0;
  const isActive = activeEmail ? emailEq(activeEmail, node.email) : false;
  const hasActiveDescendant =
    hasReports && activeEmail
      ? node.subordinates.some((s) => containsEmail(s, activeEmail))
      : false;
  const open = depth === 0 || isActive || hasActiveDescendant;
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isActive}
          render={
            <Link to="/ic/$person/personal" params={{ person: node.email }} />
          }
          style={{ paddingLeft: `${0.5 + depth * 0.875}rem` }}
        >
          {hasReports ? (
            open ? (
              <ChevronDown />
            ) : (
              <ChevronRight />
            )
          ) : (
            <span className="w-4 shrink-0" />
          )}
          {hasReports ? <Users /> : <User />}
          <span className="truncate">{node.display_name || node.email}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {hasReports && open
        ? node.subordinates.map((sub) => (
            <PersonNode
              key={sub.email}
              node={sub}
              depth={depth + 1}
              activeEmail={activeEmail}
            />
          ))
        : null}
    </>
  );
}

export function AppSidebar() {
  const { t } = useTranslation();
  const { email: viewerEmail } = useViewer();
  const viewerQ = useIcPerson(viewerEmail ?? "");
  const viewer = viewerQ.data ?? null;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeEmail = useMemo(() => {
    const m = /^\/ic\/([^/]+)/.exec(pathname);
    if (m) return decodeURIComponent(m[1]!);
    if (pathname === "/" && viewerEmail) return viewerEmail;
    return null;
  }, [pathname, viewerEmail]);

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary font-semibold text-sidebar-primary-foreground">
            I
          </div>
          <span className="font-semibold tracking-tight text-sidebar-foreground">
            {t("common.app_name")}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {!viewerEmail ? (
              <DevImpersonationHint />
            ) : viewer ? (
              <SidebarMenu>
                <PersonNode node={viewer} depth={0} activeEmail={activeEmail} />
              </SidebarMenu>
            ) : null}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === "/whats-new"}
              render={<Link to="/whats-new" />}
            >
              <Megaphone />
              <span>{t("whats_new.nav_label")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarV2Settings />
        <ThemeSwitcher />
        {viewerEmail
          ? (() => {
              const primaryEmail = viewer?.email ?? viewerEmail;
              const primary = viewer?.display_name || primaryEmail;
              const showSecondary = primary !== primaryEmail;
              return (
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" className="cursor-default">
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                          {getInitials(primary) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="truncate text-sm font-medium text-sidebar-foreground">
                          {primary}
                        </span>
                        {showSecondary ? (
                          <span className="truncate text-xs text-sidebar-foreground/60">
                            {primaryEmail}
                          </span>
                        ) : null}
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              );
            })()
          : null}
      </SidebarFooter>
    </Sidebar>
  );
}
