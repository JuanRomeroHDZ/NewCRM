import type { WriteupDetail, WriteupStructuredFinding, WriteupSummary } from '../types';

export interface WriteupCorrelation {
  report: WriteupSummary;
  reasons: string[];
  strength: number;
  evidence: 'technical' | 'asset' | 'context';
}

const GENERIC_TAGS = new Set(['htb', 'hackthebox', 'linux', 'windows', 'easy', 'medium', 'hard', 'writeup', 'pentest']);

function normalizedSet(values: Array<string | null | undefined>, pattern: RegExp): Set<string> {
  const result = new Set<string>();
  values.forEach((value) => {
    if (!value) return;
    for (const match of value.matchAll(pattern)) result.add(match[0].toUpperCase());
  });
  return result;
}

function targetSet(scope?: string | null): Set<string> {
  if (!scope) return new Set();
  const tokens = scope.match(/(?:\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?\b)|(?:\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b)/gi) || [];
  return new Set(tokens.map((token) => token.toLowerCase().replace(/^www\./, '')));
}

function tagSet(tags: string[]): Set<string> {
  return new Set(tags.map((tag) => tag.trim().toLocaleLowerCase()).filter((tag) => tag && !GENERIC_TAGS.has(tag)));
}

function idsOf(findings: WriteupStructuredFinding[], field: 'cve_id' | 'cwe_id'): string[] {
  return findings.map((finding) => finding[field] || '').filter(Boolean);
}

export function correlateWriteup(
  current: WriteupDetail,
  reports: WriteupSummary[],
  draft: { cveId?: string; cweId?: string; targetScope?: string; prospectId?: string; projectId?: string; findings?: WriteupStructuredFinding[] } = {},
): WriteupCorrelation[] {
  const currentFindings = draft.findings || current.findings || [];
  const currentCves = normalizedSet([draft.cveId, current.cve_id, ...idsOf(currentFindings, 'cve_id')], /CVE-\d{4}-\d{4,7}/gi);
  const currentCwes = normalizedSet([draft.cweId, current.cwe_id, ...idsOf(currentFindings, 'cwe_id')], /CWE-\d{1,7}/gi);
  const currentTargets = targetSet(draft.targetScope ?? current.target_scope);
  const currentTags = tagSet(current.tags || []);
  const currentProject = draft.projectId || current.project_id;
  const currentProspect = draft.prospectId || current.prospect_id;

  return reports.filter((report) => report.id !== current.id).map((report) => {
    const reasons: string[] = [];
    let strength = 0;
    const reportCves = normalizedSet([report.cve_id], /CVE-\d{4}-\d{4,7}/gi);
    const reportCwes = normalizedSet([report.cwe_id], /CWE-\d{1,7}/gi);
    const sharedCves = [...currentCves].filter((value) => reportCves.has(value));
    const sharedCwes = [...currentCwes].filter((value) => reportCwes.has(value));
    const sharedTargets = [...currentTargets].filter((value) => targetSet(report.target_scope).has(value));
    const sharedTags = [...currentTags].filter((value) => tagSet(report.tags || []).has(value));

    if (sharedCves.length) { reasons.push(`Mismo CVE: ${sharedCves.slice(0, 2).join(', ')}`); strength += 100; }
    if (sharedCwes.length) { reasons.push(`Misma clase: ${sharedCwes.slice(0, 2).join(', ')}`); strength += 75; }
    if (sharedTargets.length) { reasons.push(`Mismo activo: ${sharedTargets.slice(0, 2).join(', ')}`); strength += 65; }
    if (currentProject && report.project_id === currentProject) { reasons.push('Mismo proyecto'); strength += 30; }
    if (currentProspect && report.prospect_id === currentProspect) { reasons.push('Mismo cliente o prospecto'); strength += 20; }
    if (current.engagement_id && report.engagement_id === current.engagement_id) { reasons.push('Mismo engagement'); strength += 30; }
    if (sharedTags.length && reasons.length < 4) { reasons.push(`Etiquetas: ${sharedTags.slice(0, 2).join(', ')}`); strength += Math.min(15, sharedTags.length * 5); }

    const evidence: WriteupCorrelation['evidence'] = sharedCves.length || sharedCwes.length ? 'technical' : sharedTargets.length ? 'asset' : 'context';
    return { report, reasons, strength, evidence };
  }).filter((item) => item.reasons.length > 0)
    .sort((a, b) => b.strength - a.strength || b.report.updated_at.localeCompare(a.report.updated_at));
}
