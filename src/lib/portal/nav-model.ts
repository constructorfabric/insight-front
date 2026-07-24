import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Boxes,
  Clock,
  DollarSign,
  FileText,
  Filter,
  Fingerprint,
  GitPullRequest,
  LayoutGrid,
  Layers,
  Megaphone,
  MessageSquare,
  Plus,
  Radar,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Ticket,
  TrendingUp,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { PortalRole } from "./portal-store";

/**
 * Portal navigation model (Phase 1 buildout — mirrors the design mockup).
 *
 * This is the static composition the mockup demonstrates. Directions, their
 * lenses and the connector chips are hand-declared here for now; a later phase
 * derives them from the Analytics API metric catalog (see _work/portal-nav/SPEC.md).
 * Meaning stays server-owned; this file only carries structure + presentation.
 */

/* ── Rail zones ──────────────────────────────────────────────────────── */

export type ZoneKind = "person" | "directions" | "theme" | "manage" | "people";

export interface Zone {
  id: string;
  label: string;
  icon: LucideIcon;
  kind: ZoneKind;
}

export const ZONES: readonly Zone[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid, kind: "theme" },
  { id: "directions", label: "Directions", icon: Layers, kind: "directions" },
  { id: "person", label: "Person", icon: User, kind: "person" },
  { id: "people", label: "People", icon: Users, kind: "people" },
  { id: "aicost", label: "AI & Cost", icon: DollarSign, kind: "theme" },
  { id: "scorecard", label: "Scorecard", icon: BarChart3, kind: "theme" },
  { id: "reports", label: "Reports", icon: FileText, kind: "theme" },
  { id: "manage", label: "Manage", icon: Settings2, kind: "manage" },
];

export function zoneById(id: string | null): Zone | undefined {
  if (!id) return undefined;
  return ZONES.find((z) => z.id === id);
}

/* ── Directions (catalog-driven family list) ─────────────────────────── */

/** Connector brand chip colours (CSS custom properties from index.css). */
export const CONNECTOR_COLOR: Record<string, string> = {
  bitbucket: "var(--brand-bitbucket)",
  jira: "var(--brand-jira)",
  ci: "var(--chart-2)",
  cursor: "var(--brand-cursor)",
  claude: "var(--brand-claude-code)",
  codex: "var(--brand-codex)",
  m365: "var(--brand-m365)",
  slack: "var(--brand-slack)",
  zoom: "var(--brand-zoom)",
  zulip: "var(--brand-zulip)",
  confluence: "var(--brand-confluence)",
  outline: "var(--brand-outline)",
  hubspot: "var(--brand-hubspot)",
  zendesk: "var(--brand-zendesk)",
};

export type DirectionSource = "semantic" | "bullet";

export interface Direction {
  id: string;
  name: string;
  icon: LucideIcon;
  source: DirectionSource;
  connectors: readonly string[];
  lenses: readonly string[];
}

export const DIRECTIONS: readonly Direction[] = [
  {
    id: "dev",
    name: "Development",
    icon: GitPullRequest,
    source: "semantic",
    connectors: ["bitbucket", "jira", "ci", "cursor", "claude", "codex"],
    lenses: [
      "Overview",
      "Git output",
      "Delivery",
      "Activity",
      "Flow",
      "Quality",
      "Continuity",
      "Repositories",
      "Elements",
    ],
  },
  {
    id: "collab",
    name: "Collaboration",
    icon: MessageSquare,
    source: "semantic",
    connectors: ["m365", "slack", "zoom", "zulip"],
    lenses: ["Overview", "Messaging", "Meetings", "Email", "Focus time", "Files & sharing"],
  },
  {
    id: "wiki",
    name: "Knowledge / Wiki",
    icon: BookOpen,
    source: "semantic",
    connectors: ["confluence", "outline"],
    lenses: ["Overview", "Authoring", "Edits & comments", "Active authors"],
  },
  {
    id: "sales",
    name: "Sales / CRM",
    icon: DollarSign,
    source: "bullet",
    connectors: ["hubspot"],
    lenses: ["Pipeline", "Deal flow", "Activity", "Velocity & quality"],
  },
  {
    id: "support",
    name: "Support",
    icon: Ticket,
    source: "bullet",
    connectors: ["zendesk"],
    lenses: ["Tickets", "CSAT", "Knowledge base", "Comments & updates"],
  },
];

/* ── Theme-zone section lists ────────────────────────────────────────── */

export interface PaneItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: { text: string; tone: "warn" | "new" | "error" };
}

export interface PaneGroup {
  label?: string;
  items: readonly PaneItem[];
}

export const ZONE_SECTIONS: Record<string, readonly PaneGroup[]> = {
  overview: [
    {
      label: "Themes",
      items: [
        { id: "at-a-glance", label: "At a glance", icon: LayoutGrid },
        { id: "by-direction", label: "By direction", icon: Layers },
        { id: "trend", label: "Trend", icon: TrendingUp },
        { id: "attention", label: "Attention needed", icon: AlertTriangle },
        { id: "health", label: "Health radar", icon: Radar },
        { id: "contribution", label: "Contribution breakdown", icon: Users },
      ],
    },
  ],
  // Lean, data-honest menu: Overview is the live dashboard (adoption + by-tool
  // + cost-by-person in one scroll); the second group is capabilities that need
  // data we don't ingest yet (kept visible as honest ComingSoon, not padded out
  // into a dozen dead tabs).
  // Full intended IA. Overview / Adoption funnel / By unit are backed by real
  // data; the rest render an honest ComingSoon (see AiCostView.COMING_SOON) —
  // the menu shows the roadmap, but nothing fabricates data it doesn't have.
  aicost: [
    {
      items: [{ id: "overview", label: "Overview", icon: LayoutGrid }],
    },
    {
      label: "AI adoption",
      items: [
        { id: "adoption-funnel", label: "Adoption funnel", icon: Activity },
        { id: "by-unit-role", label: "By unit / role", icon: Layers },
        { id: "per-tool", label: "Per-tool", icon: Sparkles },
        { id: "autofix", label: "Autofix", icon: Activity },
        { id: "ai-audit", label: "AI Audit", icon: Radar },
      ],
    },
    {
      label: "Cost",
      items: [
        { id: "spend-by-tool", label: "Spend by tool", icon: DollarSign },
        { id: "cost-by-unit", label: "Cost by unit / user", icon: Users },
        { id: "idle-seats", label: "Idle seats", icon: Clock },
        { id: "credits", label: "Credits burn-down", icon: TrendingUp },
        {
          id: "ai-pricing",
          label: "AI pricing",
          icon: DollarSign,
          badge: { text: "ai.cost", tone: "error" },
        },
      ],
    },
  ],
  scorecard: [
    {
      items: [
        { id: "fixed", label: "Fixed scorecard", icon: LayoutGrid },
        { id: "detailed", label: "Detailed (drill)", icon: Layers },
        { id: "quarterly", label: "Quarterly QoQ", icon: TrendingUp },
      ],
    },
  ],
  reports: [
    {
      label: "Generated (diagnosis)",
      items: [
        { id: "delivery-trend", label: "Delivery trend v3", icon: FileText },
        { id: "ttm", label: "TTM report", icon: FileText },
      ],
    },
    {
      label: "Custom",
      items: [
        { id: "report-builder", label: "Report builder", icon: LayoutGrid },
        { id: "dashboards", label: "Saved dashboards", icon: Layers },
        { id: "new-report", label: "New report", icon: Plus },
      ],
    },
  ],
};

/* ── People zone ─────────────────────────────────────────────────────── */

// No "Person" item here — the individual view is the dedicated Person rail
// zone (reached by drilling into any name); listing it again would duplicate it.
export const PEOPLE_ITEMS: readonly PaneItem[] = [
  { id: "roster", label: "People (roster)", icon: Users },
  { id: "median-by-role", label: "Median by Role", icon: BarChart3 },
  { id: "employees", label: "Employees", icon: Fingerprint },
];

/* ── Manage zone ─────────────────────────────────────────────────────── */

export const MANAGE_ITEMS: readonly PaneItem[] = [
  { id: "metric-catalog", label: "Metric catalog", icon: LayoutGrid },
  { id: "identities", label: "Identities", icon: Fingerprint },
  { id: "taxonomy", label: "Roles & taxonomy", icon: Boxes },
  { id: "exclusions", label: "Data exclusions", icon: Filter },
  { id: "snapshots", label: "Org snapshots", icon: Clock },
  { id: "group-mgmt", label: "Group management", icon: Users },
  { id: "scorecard-mgmt", label: "Scorecard management", icon: BarChart3 },
  { id: "data-health", label: "Data health", icon: ShieldCheck },
  { id: "platform-usage", label: "Platform usage", icon: Activity },
  { id: "mcp", label: "MCP servers", icon: Server },
  { id: "config", label: "Config & setup", icon: Settings2 },
  { id: "whats-new", label: "What's new", icon: Megaphone },
];

/* ── Roles: permission (zones/dirs) + relevance (focus) ──────────────── */

export interface RoleDef {
  name: string;
  zones: readonly string[];
  dirs: readonly string[];
  focus: readonly string[];
}

const ALL_ZONES = ZONES.map((z) => z.id);
const ALL_DIRS = DIRECTIONS.map((d) => d.id);

export const ROLES: Record<PortalRole, RoleDef> = {
  exec: { name: "Exec / Admin", zones: ALL_ZONES, dirs: ALL_DIRS, focus: ALL_DIRS },
  em: {
    name: "Eng Manager",
    zones: ["overview", "directions", "person", "people", "aicost", "scorecard", "reports"],
    dirs: ["dev", "collab", "wiki"],
    focus: ["dev", "collab"],
  },
  backend: {
    name: "Backend Engineer",
    zones: ["overview", "directions", "person", "aicost"],
    dirs: ["dev", "collab", "wiki"],
    focus: ["dev", "collab"],
  },
  sales: {
    name: "Sales Lead",
    zones: ["overview", "directions", "person", "people", "reports"],
    dirs: ["sales", "collab"],
    focus: ["sales", "collab"],
  },
  support: {
    name: "Support Lead",
    zones: ["overview", "directions", "person", "reports"],
    dirs: ["support", "collab"],
    focus: ["support", "collab"],
  },
};
