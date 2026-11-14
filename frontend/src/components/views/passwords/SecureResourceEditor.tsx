import React, { useEffect, useRef, useState } from 'react';
import { Check, FolderLock, X } from 'lucide-react';
import { useVault } from '../../../context/VaultContext';
import { api } from '../../../lib/api';
import type { EntityScope, OwnershipType, SecureResource, SecureResourceType, TagItem } from '../../../types';
import { INPUT_LIMITS } from '../../../lib/validation';

interface SecureResourceEditorProps {
  resource: SecureResource | null;
  defaultScope: EntityScope;
  onClose: () => void;
  onSaved: () => void;
}

export const SecureResourceEditor: React.FC<SecureResourceEditorProps> = ({ resource, defaultScope, onClose, onSaved }) => {
  const { isUnlocked, showToast } = useVault();
  const [title, setTitle] = useState(resource?.title || '');
  const [type, setType] = useState<SecureResourceType>(resource?.resource_type || 'env_file');
  const [scope, setScope] = useState<EntityScope>(resource?.scope || defaultScope);
  const [ownership, setOwnership] = useState<OwnershipType>(resource?.ownership_type || 'own');
  const [content, setContent] = useState(resource?.content || '');
  const [tags, setTags] = useState((resource?.tags || []).map((tag) => tag.name).join(', '));
  const [notes, setNotes] = useState(resource?.notes || '');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const titleRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => titleRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!savingRef.current) onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (!isUnlocked) {
      setContent('');
      setTags('');
      setNotes('');
      onClose();
    }
  }, [isUnlocked, onClose]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isUnlocked) {
      onClose();
      return;
    }
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      showToast('Ingresa un título para el recurso.', 'error');
      return;
    }
    const tagNames = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (tagNames.length > 100 || tagNames.some((tag) => tag.length > INPUT_LIMITS.TAG_NAME)) {
      showToast('Usa hasta 100 etiquetas de máximo 50 caracteres cada una.', 'error');
      return;
    }

    setSaving(true);
    try {
      const parsedTags: TagItem[] = tagNames.map((name) => ({ name, color: '#6366f1' }));
      const payload: Partial<SecureResource> = {
        title: cleanTitle,
        resource_type: type,
        scope,
        ownership_type: ownership,
        content,
        tags: parsedTags,
        notes: notes.trim() || undefined,
      };
      if (resource) {
        await api.updateResource(resource.id, payload);
        showToast(`Recurso “${cleanTitle}” actualizado.`, 'success');
      } else {
        await api.createResource(payload);
        showToast(`Recurso “${cleanTitle}” guardado.`, 'success');
      }
      onClose();
      onSaved();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo guardar el recurso.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-2 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resource-modal-title"
        className="my-auto flex max-h-[88dvh] w-full max-w-xl min-w-0 flex-col overflow-hidden rounded-xl border border-obsidian-border bg-obsidian-panel shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-obsidian-border p-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="shrink-0 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-2 text-indigo-300">
              <FolderLock size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 id="resource-modal-title" className="truncate text-sm font-semibold text-white">
                {resource ? 'Editar recurso' : 'Nuevo recurso'}
              </h3>
              <p className="text-[11px] text-obsidian-muted">Los datos se protegen en esta bóveda</p>
            </div>
          </div>
          <button type="button" aria-label="Cerrar editor" disabled={saving} onClick={onClose} className="shrink-0 rounded-lg p-2 text-obsidian-muted hover:bg-obsidian-surface hover:text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={save} className="min-h-0 space-y-4 overflow-y-auto p-3 text-xs sm:p-5">
          <div>
            <label htmlFor="res-title-input" className="mb-1.5 block text-obsidian-muted font-medium">Título o nombre del recurso</label>
            <input
              id="res-title-input"
              ref={titleRef}
              type="text"
              required
              maxLength={INPUT_LIMITS.NAME}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ej. Variables .env de producción"
              className="min-h-10 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-3 py-2 text-white placeholder-obsidian-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
            />
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="min-w-0">
              <label htmlFor="res-type-select" className="mb-1.5 block text-obsidian-muted font-medium">Tipo</label>
              <select id="res-type-select" value={type} onChange={(event) => setType(event.target.value as SecureResourceType)} className="min-h-10 w-full min-w-0 rounded-lg border border-obsidian-border bg-obsidian-bg px-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
                <option value="env_file">Archivo .env</option>
                <option value="ssh_key">Llave SSH / certificado</option>
                <option value="backup_codes">Códigos de recuperación</option>
                <option value="software_license">Licencia de software</option>
                <option value="nota_segura">Nota privada</option>
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="res-scope-select" className="mb-1.5 block text-obsidian-muted font-medium">Ámbito</label>
              <select id="res-scope-select" value={scope} onChange={(event) => setScope(event.target.value as EntityScope)} className="min-h-10 w-full min-w-0 rounded-lg border border-obsidian-border bg-obsidian-bg px-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
                <option value="business">Empresa</option>
                <option value="personal">Personal</option>
                <option value="shared">Compartido</option>
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="res-ownership-select" className="mb-1.5 block text-obsidian-muted font-medium">Destino</label>
              <select id="res-ownership-select" value={ownership} onChange={(event) => setOwnership(event.target.value as OwnershipType)} className="min-h-10 w-full min-w-0 rounded-lg border border-obsidian-border bg-obsidian-bg px-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
                <option value="own">Uso propio</option>
                <option value="client">Vinculado a cliente</option>
                <option value="independent">Independiente</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="res-content-textarea" className="text-obsidian-muted font-medium">Contenido privado</label>
              <span className="text-[10px] text-obsidian-muted">Máximo {INPUT_LIMITS.RESOURCE_CONTENT.toLocaleString()} caracteres</span>
            </div>
            <textarea
              id="res-content-textarea"
              rows={5}
              maxLength={INPUT_LIMITS.RESOURCE_CONTENT}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Agrega códigos, claves o notas privadas."
              className="min-h-28 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-3 py-2 font-mono text-[11px] text-indigo-100 placeholder-obsidian-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
            />
          </div>

          <div>
            <label htmlFor="res-tags-input" className="mb-1.5 block text-obsidian-muted font-medium">Etiquetas separadas por coma</label>
            <input id="res-tags-input" type="text" maxLength={INPUT_LIMITS.RESOURCE_TAGS} value={tags} onChange={(event) => setTags(event.target.value)} className="min-h-10 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-3 py-2 text-white placeholder-obsidian-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300" />
          </div>

          <div>
            <label htmlFor="res-notes-textarea" className="mb-1.5 block text-obsidian-muted font-medium">Notas adicionales</label>
            <textarea id="res-notes-textarea" rows={2} maxLength={INPUT_LIMITS.NOTES} value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-3 py-2 text-white placeholder-obsidian-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300" />
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-obsidian-border pt-3">
            <button type="button" onClick={onClose} disabled={saving} className="min-h-10 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-xs font-medium text-white hover:bg-obsidian-border disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Cancelar</button>
            <button type="submit" disabled={saving || !isUnlocked} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
              <Check size={14} aria-hidden="true" />{saving ? 'Guardando…' : resource ? 'Guardar cambios' : 'Guardar recurso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
