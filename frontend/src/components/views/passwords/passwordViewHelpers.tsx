import React from 'react';
import { Briefcase, FileCode, FileText, KeyRound, ShieldCheck, Terminal, User, Users } from 'lucide-react';
import type { EntityScope, SecureResourceType } from '../../../types';

export const credentialCategoryClass = (_type: string) =>
  'border-obsidian-borderLight text-obsidian-muted';

export const resourceTypeMeta = (type: SecureResourceType) => {
  switch (type) {
    case 'env_file':
      return { label: 'Archivo .env', icon: FileCode, badgeClass: 'border-obsidian-borderLight text-obsidian-muted' };
    case 'ssh_key':
      return { label: 'Llave SSH / Certificado', icon: Terminal, badgeClass: 'border-obsidian-borderLight text-obsidian-muted' };
    case 'backup_codes':
      return { label: 'Códigos de recuperación', icon: KeyRound, badgeClass: 'border-obsidian-borderLight text-obsidian-muted' };
    case 'software_license':
      return { label: 'Licencia de software', icon: ShieldCheck, badgeClass: 'border-obsidian-borderLight text-obsidian-muted' };
    case 'nota_segura':
    default:
      return { label: 'Nota privada', icon: FileText, badgeClass: 'border-obsidian-borderLight text-obsidian-muted' };
  }
};

export const ScopeBadge: React.FC<{ scope?: EntityScope }> = ({ scope }) => {
  const isPersonal = scope === 'personal';
  const isShared = scope === 'shared';
  const Icon = isPersonal ? User : isShared ? Users : Briefcase;
  const label = isPersonal ? 'Personal' : isShared ? 'Compartido' : 'Empresa';
  const colorClass = 'border-obsidian-borderLight text-obsidian-muted';

  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};
