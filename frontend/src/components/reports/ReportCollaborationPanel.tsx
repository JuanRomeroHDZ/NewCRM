import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock3, CornerDownLeft, GitCompare, MessageSquare, Plus, RotateCcw, Send, Users, X } from 'lucide-react';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/apiErrors';
import { formatApiDateTime } from '../../lib/dates';
import type {
  CoreUser,
  ReportCollaborationResource,
  ReportComment,
  ReportCollaborator,
  ReportReview,
  ReportRevision,
  ReportWorkspaceUser,
} from '../../types';
import { describeReportSync, type ReportCollaborationController } from './useReportCollaboration';

type CollaborationTab = 'people' | 'history' | 'comments' | 'review';

interface ReportCollaborationPanelProps {
  resourceType: ReportCollaborationResource;
  resourceId: string;
  controller: ReportCollaborationController;
  operator: CoreUser | null | undefined;
  anchor: string | null;
  onClearAnchor: () => void;
  onNavigateToAnchor?: (anchor: string) => boolean;
  onClose: () => void;
  confirm: (options: { title: string; message: string; confirmLabel: string; tone: 'warning' | 'danger' }) => Promise<boolean>;
  showToast: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

const tabs: Array<{ id: CollaborationTab; label: string; icon: typeof Users }> = [
  { id: 'people', label: 'Equipo', icon: Users },
  { id: 'history', label: 'Historial', icon: Clock3 },
  { id: 'comments', label: 'Comentarios', icon: MessageSquare },
  { id: 'review', label: 'Revisión', icon: Check },
];

const controlClass = 'min-h-11 rounded-md border border-obsidian-border bg-obsidian-bg px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent disabled:cursor-not-allowed disabled:opacity-50';
const actionClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-obsidian-border px-3 text-sm text-white hover:bg-obsidian-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent disabled:cursor-not-allowed disabled:opacity-50';

function anchorActionLabel(anchor: string): string {
  try {
    const parsed = JSON.parse(anchor) as { kind?: string };
    if (parsed.kind === 'typst-range') return 'Ir al texto';
    if (parsed.kind === 'excalidraw-elements') return 'Ir al elemento';
  } catch {
    // Keep the comment readable even if an old anchor format is malformed.
  }
  return 'Ver referencia';
}

export const ReportCollaborationPanel: React.FC<ReportCollaborationPanelProps> = ({
  resourceType,
  resourceId,
  controller,
  operator,
  anchor,
  onClearAnchor,
  onNavigateToAnchor,
  onClose,
  confirm,
  showToast,
}) => {
  const [tab, setTab] = useState<CollaborationTab>('people');
  const [collaborators, setCollaborators] = useState<ReportCollaborator[]>([]);
  const [reviewers, setReviewers] = useState<ReportCollaborator[]>([]);
  const [users, setUsers] = useState<ReportWorkspaceUser[]>([]);
  const [revisions, setRevisions] = useState<ReportRevision[]>([]);
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [reviews, setReviews] = useState<ReportReview[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedPermission, setSelectedPermission] = useState<'viewer' | 'editor' | 'reviewer'>('editor');
  const [commentDraft, setCommentDraft] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const canManage = controller.permission === 'owner';
  const canEdit = controller.canEdit;
  const canComment = Boolean(controller.permission);
  const presentPeople = useMemo(
    () => new Map(controller.presentUsers.map((person) => [person.id, person.name])),
    [controller.presentUsers],
  );
  const eligibleReviewers = useMemo(
    () => reviewers.filter((item) => ['owner', 'editor', 'reviewer'].includes(item.permission)),
    [reviewers],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setPanelError(null);
    try {
      const [revisionItems, commentItems, reviewItems] = await Promise.all([
        api.listReportRevisions(resourceType, resourceId),
        api.listReportComments(resourceType, resourceId),
        api.listReportReviews(resourceType, resourceId),
      ]);
      setRevisions(revisionItems);
      setComments(commentItems);
      setReviews(reviewItems);
      if (canManage) {
        const [collaboratorItems, userItems] = await Promise.all([
          api.getReportCollaborators(resourceType, resourceId),
          api.getReportCollaborationUsers(resourceType, resourceId),
        ]);
        setCollaborators(collaboratorItems);
        setUsers(userItems);
        setReviewers(collaboratorItems.filter((item) => ['owner', 'editor', 'reviewer'].includes(item.permission)));
      } else if (canEdit) {
        setReviewers(await api.getReportReviewers(resourceType, resourceId));
      }
    } catch (error) {
      setPanelError(error instanceof ApiError ? error.message : 'No se pudo cargar la colaboración.');
    } finally {
      setLoading(false);
    }
  }, [canEdit, canManage, resourceId, resourceType]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (anchor) setTab('comments');
  }, [anchor]);

  useEffect(() => {
    if (!canManage && tab === 'people') setTab('history');
  }, [canManage, tab]);

  const runAction = async (action: () => Promise<void>, successMessage?: string) => {
    setBusy(true);
    setPanelError(null);
    try {
      await action();
      if (successMessage) showToast(successMessage, 'success');
      await refresh();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'No se pudo completar la acción.';
      setPanelError(message);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveCollaborator = () => {
    if (!selectedUserId) return;
    void runAction(async () => {
      await api.setReportCollaborator(resourceType, resourceId, selectedUserId, selectedPermission);
      setSelectedUserId('');
    }, 'Permisos del reporte actualizados.');
  };

  const removeCollaborator = async (collaborator: ReportCollaborator) => {
    if (collaborator.permission === 'owner') return;
    const accepted = await confirm({
      title: 'Retirar acceso',
      message: `¿Retirar el acceso de ${collaborator.full_name} a este reporte?`,
      confirmLabel: 'Retirar acceso',
      tone: 'warning',
    });
    if (!accepted) return;
    void runAction(() => api.removeReportCollaborator(resourceType, resourceId, collaborator.user_id), 'Acceso retirado.');
  };

  const createComment = () => {
    const body = commentDraft.trim();
    if (!body) return;
    void runAction(async () => {
      await api.createReportComment(resourceType, resourceId, body, anchor);
      setCommentDraft('');
      onClearAnchor();
    }, 'Comentario agregado.');
  };

  const resolveComment = (comment: ReportComment) => {
    void runAction(async () => { await api.resolveReportComment(resourceType, resourceId, comment.id, !comment.resolved); });
  };

  const compareRevision = async (revisionId: string) => {
    setDiff(null);
    setBusy(true);
    try {
      const result = await api.getReportRevisionDiff(resourceType, resourceId, revisionId);
      setDiff(result.diff || 'Esta versión coincide con el documento actual.');
    } catch (error) {
      setPanelError(error instanceof ApiError ? error.message : 'No se pudo comparar la versión.');
    } finally {
      setBusy(false);
    }
  };

  const restoreRevision = async (revision: ReportRevision) => {
    const accepted = await confirm({
      title: 'Restaurar versión',
      message: `Se restaurará la versión ${revision.revision_number}. La versión actual se conservará en el historial.`,
      confirmLabel: 'Restaurar versión',
      tone: 'warning',
    });
    if (!accepted) return;
    await runAction(async () => {
      await api.restoreReportRevision(resourceType, resourceId, revision.id);
      window.location.reload();
    }, 'Versión restaurada.');
  };

  const requestReview = async () => {
    if (!selectedReviewers.length) return;
    await runAction(async () => {
      await controller.checkpoint(true, 'review');
      const latest = await api.listReportRevisions(resourceType, resourceId);
      const revision = latest[0];
      if (!revision) throw new Error('No se pudo crear una versión revisable.');
      await api.requestReportReview(resourceType, resourceId, revision.id, selectedReviewers);
      setSelectedReviewers([]);
    }, 'Revisión solicitada sobre una versión fija.');
  };

  const respondToReview = (review: ReportReview, status: 'approved' | 'changes_requested') => {
    void runAction(async () => {
      await api.respondToReportReview(resourceType, resourceId, review.id, status, reviewNote);
      setReviewNote('');
    }, status === 'approved' ? 'Aprobación registrada.' : 'Cambios solicitados.');
  };

  return (
    <section
      aria-label="Colaboración del reporte"
      className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[min(30rem,100%)] flex-col border-l border-obsidian-border bg-obsidian-panel"
    >
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-obsidian-border px-4">
        <div className="min-w-0">
          <h2 className="font-heading text-sm font-semibold text-white">Colaboración</h2>
          <p className="max-w-prose text-xs leading-relaxed text-obsidian-muted" role="status">
            {describeReportSync(controller)}
          </p>
          <p className="truncate text-xs leading-relaxed tabular-nums text-obsidian-muted" title={controller.presentUsers.map((person) => person.name).join(', ')}>
            {controller.status !== 'connected' ? 'Presencia no disponible'
              : presentPeople.size === 0 ? 'Solo tú estás conectado'
                : `${presentPeople.size + 1} personas conectadas · ${Array.from(presentPeople.values()).join(', ')}`}
          </p>
        </div>
        <button type="button" onClick={onClose} className="ui-action-icon" aria-label="Cerrar colaboración">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <nav className="flex shrink-0 overflow-x-auto border-b border-obsidian-border" aria-label="Secciones de colaboración">
        {tabs.filter((item) => item.id !== 'people' || canManage).map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
            className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-xs ${tab === id ? 'border-obsidian-accent text-white' : 'border-transparent text-obsidian-muted hover:text-white'}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
          </button>
        ))}
      </nav>

      {panelError && <p role="alert" className="border-b border-obsidian-border bg-obsidian-dangerBg px-4 py-2 text-xs text-obsidian-errorText">{panelError}</p>}
      {!controller.hasLocalRecovery && (
        <p className="border-b border-obsidian-border px-4 py-2 text-xs leading-relaxed text-obsidian-muted">
          La edición requiere conexión. Para activar la recuperación local, vuelve a desbloquear la bóveda.
        </p>
      )}
      {loading ? <p className="p-4 text-sm text-obsidian-muted">Cargando colaboración…</p> : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {tab === 'people' && canManage && (
            <div className="divide-y divide-obsidian-border">
              <div className="space-y-3 p-4">
                <h3 className="text-sm font-medium text-white">Personas con acceso</h3>
                {collaborators.map((person) => (
                  <div key={person.user_id} className="flex items-center justify-between gap-3 py-1">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">{person.full_name}</p>
                      <p className="text-xs text-obsidian-muted">{person.permission === 'owner' ? 'Propietario' : person.permission === 'editor' ? 'Puede editar' : person.permission === 'reviewer' ? 'Puede revisar' : 'Solo lectura'}</p>
                    </div>
                    {person.permission !== 'owner' && <div className="flex shrink-0 gap-2">
                      <select aria-label={`Permiso de ${person.full_name}`} className={`${controlClass} min-h-11 w-36 px-2`} value={person.permission} disabled={busy} onChange={(event) => {
                        const permission = event.target.value as 'viewer' | 'editor' | 'reviewer';
                        void runAction(async () => { await api.setReportCollaborator(resourceType, resourceId, person.user_id, permission); }, 'Permiso actualizado.');
                      }}>
                        <option value="editor">Puede editar</option>
                        <option value="reviewer">Puede revisar</option>
                        <option value="viewer">Solo lectura</option>
                      </select>
                      <button type="button" className={actionClass} disabled={busy} onClick={() => void removeCollaborator(person)}>Retirar</button>
                    </div>}
                  </div>
                ))}
              </div>
              <div className="space-y-3 p-4">
                <h3 className="text-sm font-medium text-white">Compartir reporte</h3>
                <label className="block text-xs text-obsidian-muted" htmlFor="collaboration-user">Cuenta</label>
                <select id="collaboration-user" className={`${controlClass} w-full`} value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                  <option value="">Selecciona una cuenta</option>
                  {users.filter((user) => user.id !== operator?.id && !collaborators.some((item) => item.user_id === user.id)).map((user) => (
                    <option key={user.id} value={user.id}>{user.full_name} · {user.username}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <select aria-label="Permiso del colaborador" className={`${controlClass} min-w-0 flex-1`} value={selectedPermission} onChange={(event) => setSelectedPermission(event.target.value as typeof selectedPermission)}>
                    <option value="editor">Puede editar</option>
                    <option value="reviewer">Puede revisar</option>
                    <option value="viewer">Solo lectura</option>
                  </select>
                  <button type="button" className="ui-action-primary min-h-11 !px-3" disabled={!selectedUserId || busy} onClick={saveCollaborator}><Plus className="h-4 w-4" aria-hidden="true" /> Compartir</button>
                </div>
                <p className="text-xs text-obsidian-muted">Cada persona debe iniciar sesión con su propia cuenta y desbloquear la bóveda.</p>
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="divide-y divide-obsidian-border">
              <div className="flex items-center justify-between gap-3 p-4">
                <div>
                  <h3 className="text-sm font-medium text-white">Versiones guardadas</h3>
                  <p className="mt-1 text-xs text-obsidian-muted">Las versiones guardan el estado cifrado y su huella de integridad.</p>
                </div>
                {canEdit && <button type="button" className={actionClass} disabled={busy || !controller.isDirty} onClick={() => void runAction(() => controller.checkpoint(true, 'manual'), 'Versión guardada.')}><Plus className="h-4 w-4" aria-hidden="true" /> Crear versión</button>}
              </div>
              {revisions.length === 0 ? <p className="p-4 text-sm text-obsidian-muted">Aún no hay versiones.</p> : revisions.map((revision) => (
                <div key={revision.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">v{revision.revision_number} · {revision.title}</p>
                      <p className="mt-1 text-xs text-obsidian-muted">{revision.created_by} · {formatApiDateTime(revision.created_at)}</p>
                      <p className="mt-1 font-mono text-[11px] text-obsidian-muted">SHA-256 {revision.sha256.slice(0, 16)}…</p>
                    </div>
                    <button type="button" aria-label={`Comparar versión ${revision.revision_number}`} title="Comparar" className="ui-action-icon" disabled={busy} onClick={() => void compareRevision(revision.id)}><GitCompare className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                  {canManage && <button type="button" className={actionClass} disabled={busy} onClick={() => void restoreRevision(revision)}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Restaurar</button>}
                </div>
              ))}
              {diff !== null && <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-obsidian-border bg-obsidian-bg p-4 font-mono text-xs text-obsidian-muted" aria-label="Comparación de versiones">{diff}</pre>}
            </div>
          )}

          {tab === 'comments' && (
            <div className="divide-y divide-obsidian-border">
              <div className="space-y-3 p-4">
                <h3 className="text-sm font-medium text-white">Nuevo comentario</h3>
                <p className="text-xs text-obsidian-muted">{anchor ? 'Quedará vinculado a la selección actual.' : 'Comentario general del reporte.'}</p>
                <label htmlFor="report-comment-draft" className="block text-xs text-obsidian-muted">Comentario</label>
                <textarea id="report-comment-draft" className={`${controlClass} min-h-24 w-full resize-y py-2`} value={commentDraft} maxLength={12000} disabled={!canComment || busy} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Escribe una observación para el equipo…" />
                <button type="button" className="ui-action-primary min-h-11 !px-3" disabled={!commentDraft.trim() || !canComment || busy} onClick={createComment}><Send className="h-4 w-4" aria-hidden="true" /> Agregar comentario</button>
              </div>
              {comments.length === 0 ? <p className="p-4 text-sm text-obsidian-muted">Todavía no hay comentarios.</p> : comments.map((comment) => (
                <article key={comment.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{comment.created_by}</p>
                      <time className="text-xs text-obsidian-muted">{formatApiDateTime(comment.created_at)}</time>
                    </div>
                    <span className={`text-xs ${comment.resolved ? 'text-obsidian-emerald' : 'text-obsidian-amber'}`}>{comment.resolved ? 'Resuelto' : 'Abierto'}</span>
                  </div>
                  {comment.anchor && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-obsidian-muted">Vinculado a una selección</p>
                      {onNavigateToAnchor && <button type="button" className={actionClass} disabled={busy} onClick={() => {
                        if (onNavigateToAnchor(comment.anchor!)) onClose();
                        else showToast('La selección cambió y ya no se puede ubicar; el comentario sigue disponible.', 'info');
                      }}><CornerDownLeft className="h-4 w-4" aria-hidden="true" /> {anchorActionLabel(comment.anchor)}</button>}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm text-white">{comment.body}</p>
                  {(comment.created_by_id === operator?.id || canEdit || controller.permission === 'reviewer') && <button type="button" className={actionClass} disabled={busy} onClick={() => resolveComment(comment)}>{comment.resolved ? 'Reabrir' : 'Resolver'}</button>}
                </article>
              ))}
            </div>
          )}

          {tab === 'review' && (
            <div className="divide-y divide-obsidian-border">
              {canEdit && (
                <div className="space-y-3 p-4">
                  <h3 className="text-sm font-medium text-white">Solicitar aprobación</h3>
                  <p className="text-xs text-obsidian-muted">La solicitud queda ligada a una versión inmutable del reporte.</p>
                  <label className="block text-xs text-obsidian-muted" htmlFor="reviewers">Personas revisoras</label>
                  <select id="reviewers" multiple className={`${controlClass} min-h-28 w-full py-2`} value={selectedReviewers} onChange={(event) => setSelectedReviewers(Array.from(event.target.selectedOptions, (option) => option.value))}>
                    {eligibleReviewers.filter((person) => person.user_id !== operator?.id).map((person) => <option key={person.user_id} value={person.user_id}>{person.full_name}</option>)}
                  </select>
                  <button type="button" className="ui-action-primary min-h-11 !px-3" disabled={!selectedReviewers.length || busy} onClick={() => void requestReview()}><Send className="h-4 w-4" aria-hidden="true" /> Guardar y solicitar revisión</button>
                </div>
              )}
              <div className="space-y-3 p-4">
                <h3 className="text-sm font-medium text-white">Solicitudes registradas</h3>
                {reviews.length === 0 ? <p className="text-sm text-obsidian-muted">No hay solicitudes de revisión.</p> : reviews.map((review) => (
                  <article key={review.id} className="space-y-2 border-t border-obsidian-border py-3 first:border-0 first:pt-0">
                    <p className="text-sm text-white">Versión {review.revision_number} · {review.reviewer}</p>
                    <p className="text-xs text-obsidian-muted">{review.status === 'pending' ? 'Pendiente' : review.status === 'approved' ? 'Aprobada' : 'Cambios solicitados'}{review.note ? ` · ${review.note}` : ''}</p>
                    {review.reviewer_id === operator?.id && review.status === 'pending' && (
                      <>
                        <label htmlFor={`review-note-${review.id}`} className="block text-xs text-obsidian-muted">Nota de revisión</label>
                        <textarea id={`review-note-${review.id}`} className={`${controlClass} min-h-20 w-full py-2`} maxLength={12000} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Nota opcional" />
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="ui-action-primary min-h-11 !px-3" disabled={busy} onClick={() => respondToReview(review, 'approved')}><Check className="h-4 w-4" aria-hidden="true" /> Aprobar</button>
                          <button type="button" className={actionClass} disabled={busy || !reviewNote.trim()} onClick={() => respondToReview(review, 'changes_requested')}>Solicitar cambios</button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
