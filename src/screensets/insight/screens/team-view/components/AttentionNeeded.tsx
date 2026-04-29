/**
 * AttentionNeeded — computed alert list from team members metrics.
 * No state imports.
 */

import React from 'react';
import { Button, Card, CardContent } from '@hai3/uikit';
import type { TeamMember, AlertThreshold } from '../../../types';
import { METRIC_KEYS } from '../../../types';

export interface AttentionNeededProps {
  members: TeamMember[];
  alertThresholds: AlertThreshold[];
  onNavigate: (personId: string) => void;
}

type Severity = 'bad' | 'warn';

type AlertItem = {
  member: TeamMember;
  title: string;
  description: string;
  severity: Severity;
};

const SEVERITY_ICON: Record<Severity, string> = { bad: '🔴', warn: '🟡' };
const SEVERITY_ICON_BG: Record<Severity, string> = { bad: 'bg-insight-red-bg', warn: 'bg-insight-amber-bg' };


function buildDescription(metricKey: string, m: TeamMember, trigger: number): string {
  const val  = m[metricKey as keyof TeamMember] as number;
  const def  = METRIC_KEYS[metricKey as keyof typeof METRIC_KEYS];
  const unit = def?.unit ?? '';
  const label = def?.label ?? metricKey;

  const base = `${label} is ${val}${unit} vs ${trigger}${unit} target.`;

  if (metricKey === 'focus_time_pct')
    return `${base} ${m.tasks_closed} tasks completed this period.`;
  if (metricKey === 'build_success_pct') {
    // prs_merged is nullable when Bitbucket PR ingestion isn't wired — skip
    // the trailing sentence rather than reading "null PRs merged".
    return m.prs_merged !== null
      ? `${base} ${m.prs_merged} PRs merged this period.`
      : base;
  }
  if (metricKey === 'ai_loc_share_pct')
    return `${base} ${m.ai_tools.length === 0 ? 'No AI tools active.' : `Active tools: ${m.ai_tools.join(', ')}.`}`;

  return base;
}

function computeAlerts(members: TeamMember[], alertThresholds: AlertThreshold[]): AlertItem[] {
  const alerts: AlertItem[] = [];
  for (const m of members) {
    for (const rule of alertThresholds) {
      const value = m[rule.metric_key as keyof TeamMember];
      // Skip missing data — `null < trigger` coerces to true and would
      // surface phantom alerts for people the analytics layer has no
      // metrics for (synthetic rows from the IR roster path, or metrics
      // whose source connector isn't wired).
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      if (value < rule.trigger) {
        const severity: Severity = value < rule.bad ? 'bad' : 'warn';
        alerts.push({
          member: m,
          title: `${m.name} — ${rule.reason}`,
          description: buildDescription(rule.metric_key, m, rule.trigger),
          severity,
        });
      }
    }
  }
  return alerts;
}

export const AttentionNeeded: React.FC<AttentionNeededProps> = ({ members, alertThresholds, onNavigate }) => {
  const alerts = computeAlerts(members, alertThresholds);
  if (alerts.length === 0) return null;

  return (
    <Card className="shadow-sm rounded-xl">
      <div className="px-4 pt-3.5 pb-0">
        <span className="text-sm font-bold text-gray-900">Attention Needed</span>
      </div>
      <CardContent className="px-4 py-3">
        {alerts.map((alert, i) => (
          <div
            key={`${alert.member.person_id}-${i}`}
            className={`flex items-start gap-3 py-3 ${i < alerts.length - 1 ? 'border-b border-gray-200' : ''}`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${SEVERITY_ICON_BG[alert.severity]}`}>
              {SEVERITY_ICON[alert.severity]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-gray-900 mb-0.5">{alert.title}</div>
              <div className="text-xs text-gray-500">{alert.description}</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate(alert.member.person_id)}
                className="mt-1 h-auto p-0 text-xs text-blue-600 font-semibold"
              >
                → Open IC dashboard
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
