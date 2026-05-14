/**
 * Team View Screen
 * Orchestration-only: no inline components, no inline data arrays.
 *
 * Server data is consumed through the `useTeamMembers` / `useTeamBullets`
 * hooks in `queries/team.ts`. The screen does not see React Query at all —
 * it asks the hook for `members` and a section status, and renders them.
 * That mirrors the RTK Query consumer ergonomic.
 *
 * Cache lifetime is bound to the screen — `staleTime: Infinity, gcTime: 0`
 * inside the hook factories — so a navigation away clears everything and a
 * return refetches from scratch.
 *
 * Redux still owns UI-only state (drill modal, period selection, current
 * user). The migration only moved server cache out.
 */

import React, { useMemo, useState } from 'react';
import { useAppSelector, useNavigation, useScreenTranslations, useTranslation, I18nRegistry, Language } from '@hai3/react';
import { usePeriod } from '../../hooks/usePeriod';
import { deriveTeamKpis, openTeamDrill, closeTeamDrill } from '../../actions/teamViewActions';
import { selectIcPerson } from '../../actions/icDashboardActions';
import { changePeriod, setDateRange } from '../../actions/periodActions';
import { changeViewMode } from '../../actions/insightUiActions';
import {
  selectSelectedTeamId,
  selectTeamDrillId,
  selectTeamDrillData,
} from '../../slices/teamViewSlice';
import { selectCurrentUser } from '../../slices/currentUserSlice';
import { selectCustomRange } from '../../slices/periodSlice';
import { selectInsightViewMode } from '../../slices/insightUiSlice';
import { resolveDateRange } from '../../utils/periodToDateRange';
import { findIdentityNode, flattenSubordinates } from '../../utils/identityTree';
import { useTeamMembers, useTeamBullets } from '../../queries/team';
import { TEAM_VIEW_CONFIG } from '../../api/viewConfigs';
import { TeamHeroStrip } from './components/TeamHeroStrip';
import { AttentionNeeded } from './components/AttentionNeeded';
import { MembersTable } from './components/MembersTable';
import { TeamBulletSections } from './components/TeamBulletSections';
import { PeriodSelectorBar } from '../../uikit/composite/PeriodSelectorBar';
import { ViewModeToggle } from '../../uikit/composite/ViewModeToggle';
import DrillModal from '../../uikit/composite/DrillModal';
import TeamMetricsModal from './components/TeamMetricsModal';
import { INSIGHT_SCREENSET_ID, IC_DASHBOARD_SCREEN_ID, TEAM_VIEW_SCREEN_ID } from '../../ids';
import { getInitials } from '../../utils/getInitials';
import type { BulletSection, CustomRange } from '../../types';

const translations = I18nRegistry.createLoader({
  [Language.English]: () => import('./i18n/en.json'),
  [Language.Arabic]: () => import('./i18n/ar.json'),
  [Language.Bengali]: () => import('./i18n/bn.json'),
  [Language.Czech]: () => import('./i18n/cs.json'),
  [Language.Danish]: () => import('./i18n/da.json'),
  [Language.German]: () => import('./i18n/de.json'),
  [Language.Greek]: () => import('./i18n/el.json'),
  [Language.Spanish]: () => import('./i18n/es.json'),
  [Language.Persian]: () => import('./i18n/fa.json'),
  [Language.Finnish]: () => import('./i18n/fi.json'),
  [Language.French]: () => import('./i18n/fr.json'),
  [Language.Hebrew]: () => import('./i18n/he.json'),
  [Language.Hindi]: () => import('./i18n/hi.json'),
  [Language.Hungarian]: () => import('./i18n/hu.json'),
  [Language.Indonesian]: () => import('./i18n/id.json'),
  [Language.Italian]: () => import('./i18n/it.json'),
  [Language.Japanese]: () => import('./i18n/ja.json'),
  [Language.Korean]: () => import('./i18n/ko.json'),
  [Language.Malay]: () => import('./i18n/ms.json'),
  [Language.Dutch]: () => import('./i18n/nl.json'),
  [Language.Norwegian]: () => import('./i18n/no.json'),
  [Language.Polish]: () => import('./i18n/pl.json'),
  [Language.Portuguese]: () => import('./i18n/pt.json'),
  [Language.Romanian]: () => import('./i18n/ro.json'),
  [Language.Russian]: () => import('./i18n/ru.json'),
  [Language.Swedish]: () => import('./i18n/sv.json'),
  [Language.Swahili]: () => import('./i18n/sw.json'),
  [Language.Tamil]: () => import('./i18n/ta.json'),
  [Language.Thai]: () => import('./i18n/th.json'),
  [Language.Tagalog]: () => import('./i18n/tl.json'),
  [Language.Turkish]: () => import('./i18n/tr.json'),
  [Language.Ukrainian]: () => import('./i18n/uk.json'),
  [Language.Urdu]: () => import('./i18n/ur.json'),
  [Language.Vietnamese]: () => import('./i18n/vi.json'),
  [Language.ChineseSimplified]: () => import('./i18n/zh.json'),
  [Language.ChineseTraditional]: () => import('./i18n/zh-TW.json'),
});

const TeamViewScreen: React.FC = () => {
  useScreenTranslations(INSIGHT_SCREENSET_ID, TEAM_VIEW_SCREEN_ID, translations);
  const { t } = useTranslation();
  const period = usePeriod();
  const customRange = useAppSelector(selectCustomRange);
  const teamId = useAppSelector(selectSelectedTeamId);
  const currentUser = useAppSelector(selectCurrentUser);
  const viewMode = useAppSelector(selectInsightViewMode);
  const drillId = useAppSelector(selectTeamDrillId);
  const drillData = useAppSelector(selectTeamDrillData);
  const [directReportsOnly, setDirectReportsOnly] = useState(true);
  const [metricsModalOpen, setMetricsModalOpen] = useState(false);
  const { navigateToScreen } = useNavigation();

  // Resolve the IR pivot — the node in the current user's IR tree the team
  // view is anchored to. Roster (and the sidebar menu) are both derived from
  // this node's subtree, guaranteeing the two surfaces show the same people.
  //  - email teamId → drill target node anywhere in the tree
  //  - own department teamId (managerial roles) → viewer is the pivot,
  //    roster = their entire subtree
  const pivot = useMemo(() => {
    const tree = currentUser._identity ?? null;
    if (!tree) return null;
    if (teamId.includes('@')) return findIdentityNode(tree, teamId);
    const isManager = currentUser.role === 'team_lead' || currentUser.role === 'executive';
    if (isManager && teamId === tree.department) return tree;
    return null;
  }, [currentUser._identity, currentUser.role, teamId]);

  const roster = useMemo(
    () => (pivot ? flattenSubordinates(pivot) : null),
    [pivot],
  );

  const range = useMemo(
    () => resolveDateRange(period, customRange),
    [period, customRange],
  );

  // ── Server data via custom hooks ─────────────────────────────────────────
  const { members: allMembers, status: membersStatus } = useTeamMembers(
    roster,
    teamId,
    range,
    period,
  );

  // teamSize for member-scale AI bullets. Roster is authoritative when
  // present; in fallback mode we use the response count, which understates
  // when `has_next` is true ($top: 200) — same residual as before.
  const teamSize = roster ? roster.length : (allMembers.length || undefined);

  const {
    sections: bulletSections,
    status:   sectionStatus,
    errors:   sectionErrors,
  } = useTeamBullets(teamId, range, period, teamSize);

  // ── Derived UI state ─────────────────────────────────────────────────────
  const baseMembers = allMembers;
  const canFilterDirectReports = roster !== null;
  const directReportEmails = useMemo(() => {
    if (!roster) return null;
    return new Set(roster.filter((r) => r.is_direct).map((r) => r.email.toLowerCase()));
  }, [roster]);
  const members = canFilterDirectReports && directReportsOnly && directReportEmails
    ? baseMembers.filter((m) => directReportEmails.has(m.person_id.toLowerCase()))
    : baseMembers;

  // Recompute KPIs client-side over the currently visible members set. When
  // the directReportsOnly filter yields an empty set (e.g., IC with no
  // reports), use the empty-derived KPIs so chips stay consistent with the
  // (empty) member table.
  const membersLoading = membersStatus === 'loading' || membersStatus === undefined;
  const teamKpis = useMemo(
    () => (allMembers.length === 0 && membersLoading
      ? []
      : deriveTeamKpis(members, period)),
    [allMembers.length, membersLoading, members, period],
  );

  // ────────────────────────────────────────────────────────────────────────
  // Direct-reports scoping for member-scale AI metrics.
  //
  // The 4 ai_adoption bullets (active_ai_members, cursor_active, cc_active,
  // codex_active) are member-scale: their value is "N out of teamSize". When
  // "Direct reports only" is on we want them to read against the visible
  // member set, not the whole team — otherwise the table shows 5 directs but
  // the bullet still reads `74/112` for the whole org.
  //
  // The other sections (task_delivery, code_quality, estimation,
  // collaboration) come from server-side per-team aggregates that the
  // backend can't yet narrow by `person_id IN (list)`. For those we surface
  // a disclaimer rather than fake the recompute.
  // ────────────────────────────────────────────────────────────────────────
  const scopingActive =
    canFilterDirectReports &&
    directReportsOnly &&
    members.length !== allMembers.length;

  const scopedBulletSections: BulletSection[] = useMemo(() => {
    if (!scopingActive) return bulletSections;
    const scopedTeamSize = members.length;
    const recompute: Record<string, number> = {
      active_ai_members: members.filter((m) => m.ai_tools.length > 0).length,
      cursor_active:     members.filter((m) => m.ai_tools.includes('Cursor')).length,
      cc_active:         members.filter((m) => m.ai_tools.includes('Claude Code')).length,
      codex_active:      members.filter((m) => m.ai_tools.includes('Codex')).length,
    };
    return bulletSections.map((sec) => {
      if (sec.id !== 'ai_adoption') return sec;
      return {
        ...sec,
        metrics: sec.metrics.map((m) => {
          if (!(m.metric_key in recompute)) return m;
          const value = recompute[m.metric_key]!;
          const valuePct = scopedTeamSize > 0
            ? Math.min(100, (value / scopedTeamSize) * 100)
            : 0;
          return {
            ...m,
            value: String(value),
            unit: `/ ${scopedTeamSize}`,
            range_min: '0',
            range_max: String(scopedTeamSize),
            // Median is meaningless against a filtered N — drop it instead
            // of carrying the whole-team median across.
            median: '—',
            median_label: '',
            median_left_pct: 0,
            bar_left_pct: 0,
            bar_width_pct: valuePct,
          };
        }),
      };
    });
  }, [scopingActive, members, bulletSections]);

  const scopedBulletNote = scopingActive
    ? `AI Adoption is scoped to direct reports (${members.length} of ${allMembers.length} members). Other sections still reflect the whole team.`
    : null;

  // teamName is synchronous — derived from the IR pivot, no server roundtrip.
  const teamName = pivot?.display_name ?? (teamId.charAt(0).toUpperCase() + teamId.slice(1));
  const teamViewConfig = TEAM_VIEW_CONFIG;

  const handleNavigateToIc = (personId: string): void => {
    selectIcPerson(personId);
    navigateToScreen(INSIGHT_SCREENSET_ID, IC_DASHBOARD_SCREEN_ID);
  };

  const handleRangeChange = (range: CustomRange | null): void => {
    if (range) setDateRange(range);
  };

  const handleDrillClick = (drillId: string): void => {
    if (!teamId) return;
    openTeamDrill({ kind: 'team', teamId, drillId }, range);
  };

  const handleCellDrill = (personId: string, drillId: string): void => {
    if (!personId) return;
    openTeamDrill({ kind: 'cell', personId, drillId }, range);
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Screen header: team name left, controls right.
          Sticky so the team name + period stay anchored as you scroll
          long member tables / bullet sections. Mirrors IcDashboardScreen. */}
      <div className="sticky top-0 z-20 -mx-6 -mt-6 px-6 pt-6 pb-3 bg-background/95 backdrop-blur-sm border-b border-border/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {teamName && (
            <>
              <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center flex-shrink-0" role="img" aria-label={teamName}>
                <span className="text-base font-extrabold text-indigo-600">
                  {getInitials(teamName)}
                </span>
              </div>
              <div>
                <div className="text-lg font-bold text-gray-900 leading-tight">{teamName}</div>
                <div className="text-sm text-gray-500">
                  {(() => {
                    // When an executive drills into a subordinate team, teamId
                    // is that subordinate's email — use teamName (which comes
                    // back from the backend response) as the owner label so
                    // we don't mislabel the table as the viewer's own reports.
                    const isSubordinateTeam = teamId.includes('@');
                    const ownerName = isSubordinateTeam && teamName ? teamName : currentUser.name;
                    if (!ownerName) return t('header.subtitle');
                    if (canFilterDirectReports && directReportsOnly) {
                      return `Direct reports of ${ownerName}`;
                    }
                    return `${ownerName}'s department`;
                  })()}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canFilterDirectReports && (
            <label className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={directReportsOnly}
                onChange={(e) => { setDirectReportsOnly(e.target.checked); }}
                className="cursor-pointer"
              />
              <span>Direct reports only</span>
              <span className="text-xs text-gray-400">
                ({members.length}/{baseMembers.length})
              </span>
            </label>
          )}
          <PeriodSelectorBar
            period={period}
            customRange={customRange}
            onPeriodChange={changePeriod}
            onRangeChange={handleRangeChange}
          />
          <ViewModeToggle mode={viewMode} onChange={changeViewMode} />
        </div>
      </div>

      <TeamHeroStrip teamKpis={teamKpis} />

      {teamViewConfig && (
        <AttentionNeeded
          members={members}
          alertThresholds={teamViewConfig.alert_thresholds}
          onNavigate={handleNavigateToIc}
        />
      )}

      <MembersTable
        members={members}
        columnThresholds={teamViewConfig?.column_thresholds ?? []}
        loading={membersLoading}
        onRowClick={handleNavigateToIc}
        onCellDrill={handleCellDrill}
        onViewAllStats={members.length > 0 ? () => { setMetricsModalOpen(true); } : undefined}
      />

      <TeamMetricsModal
        open={metricsModalOpen}
        onClose={() => { setMetricsModalOpen(false); }}
        members={members}
        range={range}
      />

      {scopedBulletNote && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {scopedBulletNote}
        </div>
      )}

      <TeamBulletSections
        bulletSections={scopedBulletSections}
        viewMode={viewMode}
        sectionStatus={sectionStatus}
        sectionErrors={sectionErrors}
        onDrillClick={handleDrillClick}
      />

      <DrillModal open={!!drillId} drill={drillData} onClose={closeTeamDrill} />
    </div>
  );
};

TeamViewScreen.displayName = 'TeamViewScreen';

export default TeamViewScreen;
