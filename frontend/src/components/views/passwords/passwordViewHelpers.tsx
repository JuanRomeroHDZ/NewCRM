import React from 'react';
import { Briefcase, FileCode, FileText, KeyRound, ShieldCheck, Terminal, User, Users } from 'lucide-react';
import type { EntityScope, SecureResourceType } from '../../../types';

export const credentialCategoryClass = (type: string) => {
  if (type === 'api_key') return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
  if (type === 'pin') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  if (type === 'email_password') return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
  return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
};

export const resourceTypeMeta = (type: SecureResourceType) => {
  switch (type) {
    case 'env_file':
      return { label: 'Archivo .env', icon: FileCode, badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
    case 'ssh_key':
      return { label: 'Llave SSH / Certificado', icon: Terminal, badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' };
    case 'backup_codes':
      return { label: 'Códigos de recuperación', icon: KeyRound, badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
    case 'software_license':
      return { label: 'Licencia de software', icon: ShieldCheck, badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
    case 'nota_segura':
    default:
      return { label: 'Nota privada', icon: FileText, badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' };
  }
};

export const ScopeBadge: React.FC<{ scope?: EntityScope }> = ({ scope }) => {
  const isPersonal = scope === 'personal';
  const isShared = scope === 'shared';
  const Icon = isPersonal ? User : isShared ? Users : Briefcase;
  const label = isPersonal ? 'Personal' : isShared ? 'Compartido' : 'Empresa';
  const colorClass = isPersonal
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
    : isShared
    ? 'border-purple-500/20 bg-purple-500/10 text-purple-400'
    : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400';

  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold ${colorClass}`}>
      <Icon size={10} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};
