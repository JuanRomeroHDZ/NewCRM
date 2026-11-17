import type { WriteupDetail, WriteupEvidenceBlock, WriteupWorkbench } from '../../types';

export const EMPTY_WRITEUP_WORKBENCH: WriteupWorkbench = { machines: [], evidence: [] };

export function createWorkbenchId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${id}`;
}

export function interpolateSnippet(
  template: string,
  variables: { ip: string; port: string; domain: string },
): { value?: string; error?: string } {
  const ip = variables.ip.trim();
  const port = variables.port.trim();
  const domain = variables.domain.trim();
  const safeHost = /^[A-Fa-f0-9:.]+(?:\/\d{1,3})?$/.test(ip);
  const safeDomain = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/.test(domain);
  const portNumber = Number(port);
  if (template.match(/\{\{(?:ip|objetivo|target)\}\}/i) && ip && !safeHost) {
    return { error: 'La IP solo puede contener números, puntos, dos puntos y una máscara CIDR.' };
  }
  if (template.match(/\{\{(?:dominio|domain)\}\}/i) && domain && !safeDomain) {
    return { error: 'El dominio debe usar solo letras, números, puntos y guiones válidos.' };
  }
  if (template.match(/\{\{(?:puerto|port)\}\}/i) && port && (!/^\d{1,5}$/.test(port) || portNumber < 1 || portNumber > 65535)) {
    return { error: 'El puerto debe ser un número entre 1 y 65535.' };
  }

  const replacements: Record<string, string> = {
    ip,
    objetivo: ip,
    target: ip,
    port,
    puerto: port,
    domain,
    dominio: domain,
  };
  const value = template.replace(/\{\{(ip|objetivo|target|port|puerto|domain|dominio)\}\}/gi, (match, key: string) => {
    const replacement = replacements[key.toLowerCase()];
    return replacement || match;
  });
  if (/\{\{(?:ip|objetivo|target|port|puerto|domain|dominio)\}\}/i.test(value)) {
    return { error: 'Completa todas las variables del fragmento antes de insertarlo.' };
  }
  return { value };
}

export function evidenceForFinding(workbench: WriteupWorkbench, findingId: string): WriteupEvidenceBlock[] {
  return workbench.evidence.filter((evidence) => evidence.finding_ids.includes(findingId));
}

export interface PublicationReview {
  missingImages: number;
  emptyLinks: number;
  emptySections: number;
  possibleSecrets: number;
  redactedFields: number;
  pendingQuestions: number;
  pendingSteps: number;
}

export function reviewPublication(writeup: Pick<WriteupDetail, 'markdown_content' | 'assets' | 'findings' | 'workbench'>): PublicationReview {
  const source = writeup.markdown_content || '';
  const evidence = writeup.workbench?.evidence || [];
  const allContent = [source, ...evidence.flatMap((item) => [
    item.title,
    item.redact_target ? '' : item.target,
    item.redact_command ? '' : item.command,
    item.redact_result ? '' : item.result,
  ])].join('\n');
  const visible = allContent.replace(/\{\{redact:[\s\S]*?\}\}|\[\[redact:[\s\S]*?\]\]/gi, '');
  const knownAssets = new Set(writeup.assets.map((asset) => asset.id));
  const referencedAssets = new Set<string>();
  let unsupportedImageSources = 0;
  const markdownImages = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))?(?:\s+[^)]*)?\)/g;
  for (const match of source.matchAll(markdownImages)) {
    const imageSource = (match[1] || match[2] || '').trim();
    if (imageSource.startsWith('asset://')) referencedAssets.add(imageSource.slice('asset://'.length).split(/[?#]/, 1)[0]);
    else if (!imageSource.startsWith('data:image/')) unsupportedImageSources += 1;
  }
  const readAttribute = (attributes: string, name: string): string | null => {
    const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return match ? (match[1] ?? match[2] ?? match[3] ?? '').trim() : null;
  };
  let emptyHtmlLinks = 0;
  const htmlTags = /<([a-z][\w-]*)\b([^>]*)>/gi;
  for (const match of source.matchAll(htmlTags)) {
    const tagName = match[1].toLowerCase();
    if (tagName === 'a') {
      const href = readAttribute(match[2], 'href');
      if (href !== null && !href) emptyHtmlLinks += 1;
    }
    if (tagName === 'img') {
      const imageSource = readAttribute(match[2], 'src') || '';
      if (imageSource.startsWith('asset://')) referencedAssets.add(imageSource.slice('asset://'.length).split(/[?#]/, 1)[0]);
      else if (!imageSource.startsWith('data:image/')) unsupportedImageSources += 1;
    }
  }
  evidence.forEach((item) => item.asset_ids.forEach((id) => referencedAssets.add(id)));
  const missingImages = [...referencedAssets].filter((id) => !knownAssets.has(id)).length + unsupportedImageSources;
  const emptyMarkdownLinks = [...source.matchAll(/(?<!!)\[[^\]]*\]\(\s*(?:"[^"]*")?\s*\)/g)].length;
  const emptyLinks = emptyMarkdownLinks + emptyHtmlLinks;
  const lines = source.split('\n');
  let emptySections = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^#{1,6}\s+\S/.test(lines[index])) continue;
    let nextHeading = index + 1;
    while (nextHeading < lines.length && !/^#{1,6}\s+/.test(lines[nextHeading])) nextHeading += 1;
    if (!lines.slice(index + 1, nextHeading).some((line) => line.trim())) emptySections += 1;
  }
  const secretPatterns = [
    /\b(?:password|passwd|contrase(?:ña|na)|token|api[_-]?key|secret|client[_-]?secret)\s*[:=]\s*["']?[^\s"'`]{4,}/gi,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  ];
  const possibleSecrets = secretPatterns.reduce((count, pattern) => count + [...visible.matchAll(pattern)].length, 0);
  const machines = writeup.workbench?.machines || [];
  const redactedFields = evidence.reduce((count, item) =>
    count + Number(Boolean(item.redact_command && item.command)) + Number(Boolean(item.redact_result && item.result)) + Number(Boolean(item.redact_target && item.target)), 0);
  return {
    missingImages,
    emptyLinks,
    emptySections,
    possibleSecrets,
    redactedFields,
    pendingQuestions: machines.reduce((total, machine) => total + machine.questions.filter((question) => question.status === 'pendiente').length, 0),
    pendingSteps: machines.reduce((total, machine) => total + machine.steps.filter((step) => step.status === 'pendiente').length, 0),
  };
}
