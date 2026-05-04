/**
 * IcDashboardScreen — IC (Individual Contributor) personal dashboard screen.
 * Orchestration only — no direct state/API logic.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useAppSelector, useScreenTranslations, I18nRegistry, Language } from '@hai3/react';
import { changePeriod, setDateRange } from '../../actions/periodActions';
import { selectCustomRange } from '../../slices/periodSlice';
import { PeriodSelectorBar } from '../../uikit/composite/PeriodSelectorBar';
import { ViewModeToggle } from '../../uikit/composite/ViewModeToggle';
import type { CustomRange } from '../../types';
import { usePeriod } from '../../hooks/usePeriod';
import { loadIcDashboard, openDrill, closeDrill } from '../../actions/icDashboardActions';
import { changeViewMode } from '../../actions/insightUiActions';
import {
  selectPerson,
  selectIcKpis,
  selectBulletMetrics,
  selectIcCharts,
  selectTimeOffNotice,
  selectDrillId,
  selectDrillData,
  selectIcLoading,
  selectSelectedPersonId,
  selectSectionStatus,
  selectIcError,
} from '../../slices/icDashboardSlice';
import { selectInsightViewMode } from '../../slices/insightUiSlice';
import { resolveDateRange } from '../../utils/periodToDateRange';
import { INSIGHT_SCREENSET_ID, IC_DASHBOARD_SCREEN_ID } from '../../ids';
import KpiStrip from '../../uikit/composite/KpiStrip';
import MetricCard from '../../uikit/composite/MetricCard';
import CollapsibleSection from '../../uikit/composite/CollapsibleSection';
import LocStackedBar from '../../uikit/composite/LocStackedBar';
import DeliveryTrends from '../../uikit/composite/DeliveryTrends';
import DrillModal from '../../uikit/composite/DrillModal';
import ComingSoon from '../../uikit/composite/ComingSoon';
import PersonHeader from './components/PersonHeader';
import TimeOffBanner from './components/TimeOffBanner';
import AiToolsSection from './components/AiToolsSection';
import CollaborationSection from './components/CollaborationSection';
import PrivacyFooter from './components/PrivacyFooter';

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

const IcDashboardScreen: React.FC = () => {
  useScreenTranslations(INSIGHT_SCREENSET_ID, IC_DASHBOARD_SCREEN_ID, translations);
  // `selectSelectedPersonId` resolves to the selected IC, falling back to the
  // viewer themself (My Dashboard semantics) via userContext. No routing
  // branch needed — the context slice already encodes the intent.
  const personId = useAppSelector(selectSelectedPersonId);
  const period = usePeriod();
  const customRange = useAppSelector(selectCustomRange);
  const viewMode = useAppSelector(selectInsightViewMode);

  const handleRangeChange = (range: CustomRange | null): void => {
    if (range) setDateRange(range);
  };

  const person = useAppSelector(selectPerson);
  const kpis = useAppSelector(selectIcKpis);
  const bulletMetrics = useAppSelector(selectBulletMetrics);
  const charts = useAppSelector(selectIcCharts);
  const timeOffNotice = useAppSelector(selectTimeOffNotice);
  const drillId = useAppSelector(selectDrillId);
  const drillData = useAppSelector(selectDrillData);
  const loading = useAppSelector(selectIcLoading);
  const dashboardError = useAppSelector(selectIcError);

  // Per-section status (loading | revalidating | loaded | errored | undefined)
  const kpisStatus           = useAppSelector(selectSectionStatus('kpis'));
  const taskDeliveryStatus   = useAppSelector(selectSectionStatus('task_delivery'));
  const gitOutputStatus      = useAppSelector(selectSectionStatus('git_output'));
  const collaborationStatus  = useAppSelector(selectSectionStatus('collaboration'));
  const aiAdoptionStatus     = useAppSelector(selectSectionStatus('ai_adoption'));
  const locTrendStatus       = useAppSelector(selectSectionStatus('loc_trend'));
  const deliveryTrendStatus  = useAppSelector(selectSectionStatus('delivery_trend'));

  // Subtle "I'm refreshing" cue applied to sections that already have data but
  // are re-fetching — fades content to ~70% opacity until the new payload
  // lands. Animations are short (300ms) so they don't draw attention away.
  function revalidatingClass(status: string | undefined): string {
    return status === 'revalidating'
      ? 'opacity-70 transition-opacity duration-300'
      : 'opacity-100 transition-opacity duration-300';
  }

  // Distinguish person change (hard reset, drop stale data) vs. period change
  // (soft reset, keep current values on screen as stale while fetch is in
  // flight). Without this, every period tick wipes the dashboard back to
  // skeletons, which reads as "everything jumped".
  const lastPersonRef = useRef<string | null>(null);
  const reload = useCallback((reason: 'person' | 'period' = 'person'): void => {
    if (!personId) return;
    loadIcDashboard(personId, period, resolveDateRange(period, customRange), reason);
    lastPersonRef.current = personId;
  }, [personId, period, customRange]);

  useEffect(() => {
    const reason: 'person' | 'period' =
      lastPersonRef.current !== null && lastPersonRef.current === personId
        ? 'period'
        : 'person';
    reload(reason);
  }, [reload, personId]);

  // Filter bullet metrics by section. Section names are aligned with Team View
  // (transforms.ts / BULLET_DEFS) so the same defs drive labels+thresholds.
  const taskMetrics = bulletMetrics.filter((m) => m.section === 'task_delivery');
  const gitMetrics = bulletMetrics.filter((m) => m.section === 'git_output');
  const codeMetrics = bulletMetrics.filter((m) => m.section === 'code_quality');
  const aiToolsMetrics = bulletMetrics.filter((m) => m.section === 'ai_adoption');
  const collabMetrics = bulletMetrics.filter((m) => m.section === 'collaboration');

  // API returns period-filtered kpis — use directly
  const currentKpis = kpis;

  const handleDrillClick = (drillIdVal: string): void => {
    if (!personId) return;
    openDrill(personId, drillIdVal, resolveDateRange(period, customRange));
  };

  // Identity failure: hide the whole screen — the per-section progressive
  // pattern doesn't apply because we cannot render a meaningful PersonHeader
  // without it. Mirrors the previous setError() / IcDashboardLoadFailed path.
  if (dashboardError) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-xl px-12 py-8 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <div className="text-base font-bold text-gray-900 mb-1.5">Unable to load dashboard</div>
          <div className="text-sm text-gray-500 mb-3">{dashboardError}</div>
          <button
            type="button"
            onClick={() => { reload(); }}
            className="rounded-md border border-red-300 bg-white px-3 py-1 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Not-found state — only after we actually have a personId to fetch for.
  if (personId && !loading && !person) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="bg-white border border-gray-200 rounded-xl px-12 py-8 text-center">
          <div className="text-4xl mb-3">👤</div>
          <div className="text-base font-bold text-gray-900 mb-1.5">Person not found</div>
          <div className="text-sm text-gray-500">
            No data available for person ID: {personId}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 0+1. Person header + controls in one row — sticks to the top so the
          context (who you're looking at, in what period) stays in view as
          you scroll long sections. `-mx-4 px-4` so the bar stretches to the
          edges of the parent's padding; `-mt-4 pt-4` for the same on top.
          A faint bottom border + subtle shadow appear once the bar is
          actually pinned (visually identical to "loose" while at the top). */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 px-4 pt-4 pb-3 bg-background/95 backdrop-blur-sm border-b border-border/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PersonHeader person={person} inline />
          <div className="flex items-center gap-2 flex-shrink-0">
            <PeriodSelectorBar
              period={period}
              customRange={customRange}
              onPeriodChange={changePeriod}
              onRangeChange={handleRangeChange}
            />
            <ViewModeToggle mode={viewMode} onChange={changeViewMode} />
          </div>
        </div>
      </div>

      {/* 2. KPI strip + time-off banner */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {kpisStatus === 'loading' && currentKpis.length === 0 ? (
          <div className="p-4">
            <ComingSoon variant="row" state="loading" />
          </div>
        ) : kpisStatus === 'errored' ? (
          <div className="p-4">
            <ComingSoon variant="row" state="error" onRetry={() => { reload(); }} />
          </div>
        ) : (
          <div className={revalidatingClass(kpisStatus)}>
            <KpiStrip kpis={currentKpis} plain={true} />
          </div>
        )}
        <TimeOffBanner notice={timeOffNotice} />
      </div>

      {/* 3. Task Delivery + Git Output */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MetricCard
          title="Task Delivery"
          metrics={taskMetrics}
          columns={1}
          onDrillClick={handleDrillClick}
          mode={viewMode}
          personName={person?.name}
          loading={taskDeliveryStatus === 'loading'}
          revalidating={taskDeliveryStatus === 'revalidating'}
          errored={taskDeliveryStatus === 'errored'}
          onRetry={() => { reload(); }}
        />
        <MetricCard
          title="Git Output"
          metrics={gitMetrics}
          columns={1}
          onDrillClick={handleDrillClick}
          mode={viewMode}
          personName={person?.name}
          loading={gitOutputStatus === 'loading'}
          revalidating={gitOutputStatus === 'revalidating'}
          errored={gitOutputStatus === 'errored'}
          onRetry={() => { reload(); }}
        />
      </div>

      {/* 4. Code Quality */}
      <MetricCard
        title="Code Quality"
        metrics={codeMetrics}
        columns={3}
        onDrillClick={handleDrillClick}
        mode={viewMode}
        personName={person?.name}
      />

      {/* 5. LOC Breakdown */}
      <CollapsibleSection
        title="LOC Breakdown"
        subtitle="Bitbucket · lines added per period · AI-assisted vs manual vs spec/config"
        storageKey="insight:ic-dashboard:loc-breakdown"
      >
        <div className="p-4">
          {locTrendStatus === 'loading' && charts.locTrend.length === 0 ? (
            <ComingSoon variant="card" state="loading" />
          ) : locTrendStatus === 'errored' ? (
            <ComingSoon variant="card" state="error" onRetry={() => { reload(); }} />
          ) : (
            <div className={revalidatingClass(locTrendStatus)}>
              <LocStackedBar data={charts.locTrend} />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* 6. Delivery Trends */}
      <CollapsibleSection
        title="Delivery Trends"
        subtitle="Jira + Bitbucket · activity counts · Commits, PRs and Tasks are independent signals — not directly comparable"
        storageKey="insight:ic-dashboard:delivery-trends"
      >
        <div className="p-4">
          {deliveryTrendStatus === 'loading' && charts.deliveryTrend.length === 0 ? (
            <ComingSoon variant="card" state="loading" />
          ) : deliveryTrendStatus === 'errored' ? (
            <ComingSoon variant="card" state="error" onRetry={() => { reload(); }} />
          ) : (
            <div className={revalidatingClass(deliveryTrendStatus)}>
              <DeliveryTrends data={charts.deliveryTrend} />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* 7. AI Dev Tools & AI Chat */}
      <CollapsibleSection title="AI Dev Tools & AI Chat" storageKey="insight:ic-dashboard:ai-tools">
        {aiAdoptionStatus === 'loading' && aiToolsMetrics.length === 0 ? (
          <div className="p-4"><ComingSoon variant="card" state="loading" /></div>
        ) : aiAdoptionStatus === 'errored' ? (
          <div className="p-4"><ComingSoon variant="card" state="error" onRetry={() => { reload(); }} /></div>
        ) : (
          <div className={revalidatingClass(aiAdoptionStatus)}>
            <AiToolsSection
              metrics={aiToolsMetrics}
              viewMode={viewMode}
              onDrillClick={handleDrillClick}
              personName={person?.name}
            />
          </div>
        )}
      </CollapsibleSection>

      {/* 8. Collaboration */}
      <CollapsibleSection title="Collaboration" storageKey="insight:ic-dashboard:collaboration">
        {collaborationStatus === 'loading' && collabMetrics.length === 0 ? (
          <div className="p-4"><ComingSoon variant="card" state="loading" /></div>
        ) : collaborationStatus === 'errored' ? (
          <div className="p-4"><ComingSoon variant="card" state="error" onRetry={() => { reload(); }} /></div>
        ) : (
          <div className={revalidatingClass(collaborationStatus)}>
            <CollaborationSection
              metrics={collabMetrics}
              viewMode={viewMode}
              onDrillClick={handleDrillClick}
              personName={person?.name}
            />
          </div>
        )}
      </CollapsibleSection>

      {/* 9. Privacy footer */}
      <PrivacyFooter />

      {/* 10. Drill modal */}
      <DrillModal open={!!drillId} drill={drillData} onClose={closeDrill} />
    </div>
  );
};

export default IcDashboardScreen;
