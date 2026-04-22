/**
 * Team View Screen
 * Orchestration-only: no inline components, no inline data arrays.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAppSelector, useNavigation, useScreenTranslations, useTranslation, I18nRegistry, Language } from '@hai3/react';
import { usePeriod } from '../../hooks/usePeriod';
import { loadTeamView, deriveTeamKpis, openTeamDrill, closeTeamDrill } from '../../actions/teamViewActions';
import { selectIcPerson } from '../../actions/icDashboardActions';
import { changePeriod, setDateRange } from '../../actions/periodActions';
import { changeViewMode } from '../../actions/insightUiActions';
import {
  selectMembers,
  selectTeamKpis,
  selectBulletSections,
  selectTeamViewLoading,
  selectTeamName,
  selectTeamViewConfig,
  selectSelectedTeamId,
  selectTeamDrillId,
  selectTeamDrillData,
  selectTeamAvailability,
} from '../../slices/teamViewSlice';
import { selectCurrentUser } from '../../slices/currentUserSlice';
import { selectCustomRange } from '../../slices/periodSlice';
import { selectInsightViewMode } from '../../slices/insightUiSlice';
import { resolveDateRange } from '../../utils/periodToDateRange';
import { TeamHeroStrip } from './components/TeamHeroStrip';
import { AttentionNeeded } from './components/AttentionNeeded';
import { MembersTable } from './components/MembersTable';
import { TeamBulletSections } from './components/TeamBulletSections';
import { PeriodSelectorBar } from '../../uikit/composite/PeriodSelectorBar';
import { ViewModeToggle } from '../../uikit/composite/ViewModeToggle';
import DrillModal from '../../uikit/composite/DrillModal';
import { INSIGHT_SCREENSET_ID, IC_DASHBOARD_SCREEN_ID, TEAM_VIEW_SCREEN_ID } from '../../ids';
import { getInitials } from '../../utils/getInitials';
import type { CustomRange } from '../../types';

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
  const loading = useAppSelector(selectTeamViewLoading);
  const allMembers = useAppSelector(selectMembers);
  const [directReportsOnly, setDirectReportsOnly] = useState(true);
  // Team Lead sees their own data via "My Dashboard" — exclude from the team table.
  // When "Direct reports only" toggle is on, narrow to people whose supervisor_email
  // matches the current user (for managers) or the current user's own supervisor
  // (siblings in same team, for ICs).
  const baseMembers = currentUser.role === 'team_lead'
    ? allMembers.filter((m) => m.person_id !== currentUser.personId)
    : allMembers;
  // `teamId` is either an email (executive drilled into a subordinate's team)
  // or an org_unit_name string. The direct-reports anchor is:
  //  - the email itself, when teamId is an email;
  //  - the team_lead's own email, when viewing their own department;
  //  - none (executive browsing a flat org_unit), so the checkbox is hidden.
  const teamOwnerEmail = teamId.includes('@')
    ? teamId.toLowerCase()
    : currentUser.role === 'team_lead'
      ? (currentUser._identity?.email ?? currentUser.personId ?? '').toLowerCase() || null
      : null;
  const canFilterDirectReports = teamOwnerEmail !== null;
  const members = directReportsOnly && teamOwnerEmail
    ? baseMembers.filter((m) =>
        (m.supervisor_email ?? '').toLowerCase() === teamOwnerEmail,
      )
    : baseMembers;
  const storeTeamKpis = useAppSelector(selectTeamKpis);
  // Recompute KPIs client-side over the currently visible members set. When the
  // directReportsOnly filter yields an empty set (e.g., IC with no reports), use
  // the empty-derived KPIs so chips stay consistent with the (empty) member table.
  // Only fall back to the store when members haven't been fetched yet (both sets
  // empty AND still loading).
  const availability = useAppSelector(selectTeamAvailability);
  const teamKpis = useMemo(
    () => (allMembers.length === 0 && loading
      ? storeTeamKpis
      : deriveTeamKpis(members, period, availability ?? undefined)),
    [allMembers.length, loading, members, period, storeTeamKpis, availability],
  );
  const bulletSections = useAppSelector(selectBulletSections);
  const teamName = useAppSelector(selectTeamName);
  const teamViewConfig = useAppSelector(selectTeamViewConfig);
  const viewMode = useAppSelector(selectInsightViewMode);
  const drillId = useAppSelector(selectTeamDrillId);
  const drillData = useAppSelector(selectTeamDrillData);
  const { navigateToScreen } = useNavigation();

  useEffect(() => {
    if (!teamId) return;
    loadTeamView(teamId, period, resolveDateRange(period, customRange));
  }, [teamId, period, customRange]);

  const handleNavigateToIc = (personId: string): void => {
    selectIcPerson(personId);
    navigateToScreen(INSIGHT_SCREENSET_ID, IC_DASHBOARD_SCREEN_ID);
  };

  const handleRangeChange = (range: CustomRange | null): void => {
    if (range) setDateRange(range);
  };

  const handleDrillClick = (drillId: string): void => {
    if (!teamId) return;
    openTeamDrill({ kind: 'team', teamId, drillId });
  };

  const handleMembersDrill = (): void => {
    handleDrillClick('team-members');
  };

  const handleCellDrill = (personId: string, drillId: string): void => {
    if (!personId) return;
    openTeamDrill({ kind: 'cell', personId, drillId });
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Screen header: team name left, controls right */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {teamName && (
            <>
              <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center flex-shrink-0" role="img" aria-label={teamName}>
                <span className="text-sm font-extrabold text-indigo-600">
                  {getInitials(teamName)}
                </span>
              </div>
              <div>
                <div className="text-base font-bold text-gray-900 leading-tight">{teamName}</div>
                <div className="text-xs text-gray-400">
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
        loading={loading}
        onRowClick={handleNavigateToIc}
        onDetailsDrill={handleMembersDrill}
        onCellDrill={handleCellDrill}
      />

      <TeamBulletSections
        bulletSections={bulletSections}
        viewMode={viewMode}
        onDrillClick={handleDrillClick}
      />

      <DrillModal open={!!drillId} drill={drillData} onClose={closeTeamDrill} />
    </div>
  );
};

TeamViewScreen.displayName = 'TeamViewScreen';

export default TeamViewScreen;
