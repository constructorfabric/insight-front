/**
 * TeamBulletSections — bullet metric sections for team view.
 * task_delivery + code_quality + estimation: always-visible cards with Legend.
 * ai_adoption + collaboration: collapsible with custom sub-group layouts.
 * No state imports.
 */

import React from 'react';
import { Card, CardContent } from '@hai3/uikit';
import CollapsibleSection from '../../../uikit/composite/CollapsibleSection';
import BulletChart from '../../../uikit/composite/BulletChart';
import type { BulletSection, BulletMetric, ViewMode } from '../../../types';
import { filterBulletsByLayoutGroup } from '../../../api/thresholdConfig';

export interface TeamBulletSectionsProps {
  bulletSections: BulletSection[];
  viewMode: ViewMode;
  /** Per-section status from the slice — drives skeleton/error placeholders. */
  sectionStatus?: Record<string, 'loading' | 'revalidating' | 'loaded' | 'errored' | undefined>;
  /** Per-section error messages, only shown when status === 'errored'. */
  sectionErrors?: Record<string, string | undefined>;
  onDrillClick?: (drillId: string) => void;
}

const SectionPlaceholder: React.FC<{ title: string; kind: 'loading' | 'errored'; error?: string }> = ({ title, kind, error }) => (
  <Card className="bg-white">
    <CardContent className="px-3.5 py-3">
      <div className="text-sm font-semibold text-gray-900 mb-2">{title}</div>
      {kind === 'loading' ? (
        <div className="flex flex-col gap-2 animate-pulse">
          <div className="h-3 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-2/3" />
          <div className="h-3 bg-gray-100 rounded w-4/5" />
        </div>
      ) : (
        <div className="text-2xs text-red-600">
          {error ?? 'Failed to load'}
        </div>
      )}
    </CardContent>
  </Card>
);

// Shared bullet legend used in all team sections — matches the IC dashboard
// legend so the same swatches mean the same thing across screens. Gray bar =
// median (company-wide on team view, team-wide on IC view); gradient swatch
// communicates that the bullet bar is color-coded by status (green = good,
// amber = warn, red = bad) against the metric's good/warn thresholds.
const Legend: React.FC = () => (
  <div className="flex items-center gap-3 text-2xs text-gray-400 mb-2.5">
    <span className="flex items-center gap-1">
      <span className="w-[2px] h-3 bg-gray-800/60 rounded inline-block" />
      Company median
    </span>
    <span className="flex items-center gap-1">
      <span className="w-4 h-1.5 rounded bg-gradient-to-r from-green-600 via-amber-600 to-red-600 inline-block" />
      Team result · color = vs target
    </span>
  </div>
);

// Standard 2-column bullet card (Task Delivery, Code Quality)
const TwoColCard: React.FC<{ title: string; subtitle: string; metrics: BulletMetric[]; onDrillClick?: (id: string) => void }> = ({
  title, subtitle, metrics, onDrillClick
}) => {
  const left = metrics.filter((_, i) => i % 2 === 0);
  const right = metrics.filter((_, i) => i % 2 !== 0);
  return (
    <Card className="shadow-sm rounded-xl">
      <CardContent className="px-4 py-3.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-bold text-gray-900">{title}</span>
          <span className="text-xs text-gray-400">{subtitle}</span>
        </div>
        <Legend />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="flex flex-col gap-4">{left.map((m) => <BulletChart key={m.metric_key} metric={m} onDrillClick={onDrillClick} mode="chart" />)}</div>
          <div className="flex flex-col gap-4">{right.map((m) => <BulletChart key={m.metric_key} metric={m} onDrillClick={onDrillClick} mode="chart" />)}</div>
        </div>
      </CardContent>
    </Card>
  );
};

// Estimation card — 3 sub-groups driven by BULLET_LAYOUT_GROUPS so adding a
// new estimation metric automatically slots into the right column.
const ESTIMATION_GROUPS = [
  { label: '1 · Time estimate accuracy', group: 'estimate_accuracy' },
  { label: '2 · Sprint scope',           group: 'sprint_scope' },
  { label: '3 · Deadline (date-driven)', group: 'deadline' },
];

const EstimationCard: React.FC<{ metrics: BulletMetric[]; onDrillClick?: (id: string) => void }> = ({ metrics, onDrillClick }) => (
  <Card className="shadow-sm rounded-xl">
    <CardContent className="px-4 py-3.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-gray-900">Estimation</span>
        <span className="text-xs text-gray-400">Team median vs company median · Source: Jira</span>
      </div>
      <Legend />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
        {ESTIMATION_GROUPS.map(({ label, group }) => {
          const groupMetrics = filterBulletsByLayoutGroup(metrics, group);
          return (
            <div key={label}>
              <div className="text-xs font-semibold text-gray-400 mb-1.5">{label}</div>
              <div className="flex flex-col gap-4">
                {groupMetrics.map((m) => <BulletChart key={m.metric_key} metric={m} onDrillClick={onDrillClick} mode="chart" />)}
              </div>
            </div>
          );
        })}
      </div>
    </CardContent>
  </Card>
);

// AI Adoption — collapsible, 2-column (left: member counts, right: team
// output + acceptance rates). Both columns go through
// filterBulletsByLayoutGroup so the grouping lives entirely in
// thresholdConfig (the right column is just the concat of two groups).
const AI_RIGHT_GROUPS = ['ai_team_output', 'ai_acceptance'] as const;

const AiAdoptionSection: React.FC<{ metrics: BulletMetric[]; onDrillClick?: (id: string) => void }> = ({ metrics, onDrillClick }) => {
  const leftMetrics = filterBulletsByLayoutGroup(metrics, 'ai_members');
  const rightMetrics = AI_RIGHT_GROUPS.flatMap((g) => filterBulletsByLayoutGroup(metrics, g));
  return (
    <CollapsibleSection title="AI Adoption" defaultOpen={false} storageKey="insight:team-view:ai-adoption">
      <div className="px-4 py-3">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">Cursor · Claude Code · Codex</div>
        <Legend />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="flex flex-col gap-4">
            {leftMetrics.map((m) => (
              <BulletChart key={m.metric_key} metric={m} onDrillClick={onDrillClick} mode="chart" />
            ))}
          </div>
          <div className="flex flex-col gap-4">
            {rightMetrics.map((m) => (
              <BulletChart key={m.metric_key} metric={m} onDrillClick={onDrillClick} mode="chart" />
            ))}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
};

// Collaboration — collapsible, 4 columns by activity type (chat / email /
// meetings / files) via filterBulletsByLayoutGroup. Source vendor stays
// visible inside each metric's own sublabel. Keep in sync with the
// ic-dashboard CollaborationSection.
const CollaborationSection: React.FC<{ metrics: BulletMetric[]; onDrillClick?: (id: string) => void }> = ({ metrics, onDrillClick }) => {
  const chatMetrics     = filterBulletsByLayoutGroup(metrics, 'chat');
  const emailMetrics    = filterBulletsByLayoutGroup(metrics, 'email');
  const meetingsMetrics = filterBulletsByLayoutGroup(metrics, 'meetings');
  const filesMetrics    = filterBulletsByLayoutGroup(metrics, 'files');

  function renderColumn(heading: string, items: BulletMetric[]): React.ReactElement {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">{heading}</div>
        {items.map((m) => (
          <BulletChart key={m.metric_key} metric={m} onDrillClick={onDrillClick} mode="chart" />
        ))}
      </div>
    );
  }

  return (
    <CollapsibleSection title="Collaboration" defaultOpen={false} storageKey="insight:team-view:collaboration">
      <div className="px-4 py-3">
        <Legend />
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-3.5 gap-y-2">
          {renderColumn('Chat', chatMetrics)}
          {renderColumn('Email', emailMetrics)}
          {renderColumn('Meetings', meetingsMetrics)}
          {renderColumn('Files', filesMetrics)}
        </div>
      </div>
    </CollapsibleSection>
  );
};

export const TeamBulletSections: React.FC<TeamBulletSectionsProps> = ({
  bulletSections,
  sectionStatus = {},
  sectionErrors = {},
  onDrillClick,
}) => {
  const byId = Object.fromEntries(bulletSections.map((s) => [s.id, s]));

  // Decide what to show for each section card. A section renders its data
  // when status is 'loaded' AND the bullet payload arrived, a skeleton when
  // 'loading' (or status not yet emitted), an error placeholder otherwise.
  // When status is undefined (server hasn't been asked yet), we render
  // nothing — same as before — so the screen layout stays compact when a
  // section isn't applicable.
  function renderState(sid: string): 'data' | 'loading' | 'errored' | 'skip' {
    // sid is one of a small fixed set of literal section names; no user
    // input reaches this lookup. Codacy's security/detect-object-injection
    // rule still flags the bracket access — mark as false positive on
    // review.
    const st = sectionStatus[sid];
    // Treat 'revalidating' the same as 'loaded' for layout — keep data on
    // screen; the dim/fade is applied by the per-section wrapper below.
    if ((st === 'loaded' || st === 'revalidating') && byId[sid]) return 'data';
    if (st === 'loading') return 'loading';
    if (st === 'errored') return 'errored';
    return 'skip';
  }

  function dimClass(sid: string): string {
    return sectionStatus[sid] === 'revalidating'
      ? 'opacity-70 transition-opacity duration-300'
      : 'opacity-100 transition-opacity duration-300';
  }

  const taskDeliveryState = renderState('task_delivery');
  const codeQualityState  = renderState('code_quality');
  const aiAdoptionState   = renderState('ai_adoption');
  const collabState       = renderState('collaboration');

  const taskDelivery = byId['task_delivery'];
  const codeQuality  = byId['code_quality'];
  const estimation   = byId['estimation'];
  const aiAdoption   = byId['ai_adoption'];
  const collab       = byId['collaboration'];

  return (
    <div className="flex flex-col gap-3.5">
      {/* Task Delivery + Code & Quality — side by side */}
      {(taskDeliveryState !== 'skip' || codeQualityState !== 'skip') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {taskDeliveryState === 'data' && taskDelivery && (
            <div className={dimClass('task_delivery')}>
              <TwoColCard
                title="Task Delivery"
                subtitle="Team median vs company median"
                metrics={taskDelivery.metrics}
                onDrillClick={onDrillClick}
              />
            </div>
          )}
          {taskDeliveryState === 'loading' && (
            <SectionPlaceholder title="Task Delivery" kind="loading" />
          )}
          {taskDeliveryState === 'errored' && (
            <SectionPlaceholder title="Task Delivery" kind="errored" error={sectionErrors['task_delivery']} />
          )}
          {codeQualityState === 'data' && codeQuality && (
            <div className={dimClass('code_quality')}>
              <TwoColCard
                title="Code & Quality"
                subtitle="Team median vs company median"
                metrics={codeQuality.metrics}
                onDrillClick={onDrillClick}
              />
            </div>
          )}
          {codeQualityState === 'loading' && (
            <SectionPlaceholder title="Code & Quality" kind="loading" />
          )}
          {codeQualityState === 'errored' && (
            <SectionPlaceholder title="Code & Quality" kind="errored" error={sectionErrors['code_quality']} />
          )}
        </div>
      )}

      {/* Estimation — backend doesn't emit status for it; legacy conditional */}
      {estimation && <EstimationCard metrics={estimation.metrics} onDrillClick={onDrillClick} />}

      {/* AI Adoption */}
      {aiAdoptionState === 'data' && aiAdoption && (
        <div className={dimClass('ai_adoption')}>
          <AiAdoptionSection metrics={aiAdoption.metrics} onDrillClick={onDrillClick} />
        </div>
      )}
      {aiAdoptionState === 'loading' && <SectionPlaceholder title="AI Adoption" kind="loading" />}
      {aiAdoptionState === 'errored' && (
        <SectionPlaceholder title="AI Adoption" kind="errored" error={sectionErrors['ai_adoption']} />
      )}

      {/* Collaboration */}
      {collabState === 'data' && collab && (
        <div className={dimClass('collaboration')}>
          <CollaborationSection metrics={collab.metrics} onDrillClick={onDrillClick} />
        </div>
      )}
      {collabState === 'loading' && <SectionPlaceholder title="Collaboration" kind="loading" />}
      {collabState === 'errored' && (
        <SectionPlaceholder title="Collaboration" kind="errored" error={sectionErrors['collaboration']} />
      )}
    </div>
  );
};
