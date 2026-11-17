import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BookOpen, Check, CheckCircle2, Clipboard, FileText, Plus, Save, ShieldAlert, Trash2, X } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { api } from '../../lib/api';
import type {
  WriteupAsset, WriteupDetail, WriteupEvidenceBlock, WriteupMachineProgress,
  WriteupSnippet, WriteupStructuredFinding, WriteupWorkbench,
} from '../../types';
import { createWorkbenchId, interpolateSnippet, reviewPublication } from './writeupWorkbenchUtils';

type WorkbenchTab = 'evidence' | 'progress' | 'snippets' | 'publish';

interface WriteupWorkbenchModalProps {
  writeup: WriteupDetail;
  value: WriteupWorkbench;
  findings: WriteupStructuredFinding[];
  assets: WriteupAsset[];
  markdown: string;
  readOnly?: boolean;
  initialTab?: WorkbenchTab;
  focusEvidenceId?: string | null;
  onChange: (value: WriteupWorkbench) => void;
  onInsertSnippet: (text: string) => void;
  onNavigateFinding: (findingId: string) => void;
  onInspectAsset: (asset: WriteupAsset) => void;
  onClose: () => void;
}

const fieldClass = 'min-h-9 w-full min-w-0 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500';
const iconButtonClass = 'inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-40';
const panelClass = 'rounded-lg border border-slate-800 bg-slate-950/60 p-3';

const createEvidence = (): WriteupEvidenceBlock => ({
  id: createWorkbenchId('evidence'), title: '', command: '', result: '', target: '',
  captured_at: new Date().toISOString(), asset_ids: [], finding_ids: [],
  redact_command: false, redact_result: false, redact_target: false,
});

const createMachine = (): WriteupMachineProgress => ({
  id: createWorkbenchId('machine'), name: '', target: '', status: 'en_progreso', questions: [], steps: [],
});

const toLocalDateTimeInput = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export const WriteupWorkbenchModal: React.FC<WriteupWorkbenchModalProps> = ({
  writeup, value, findings, assets, markdown, readOnly = false, initialTab = 'evidence',
  focusEvidenceId, onChange, onInsertSnippet, onNavigateFinding, onInspectAsset, onClose,
}) => {
  const [tab, setTab] = useState<WorkbenchTab>(initialTab);
  const [snippets, setSnippets] = useState<WriteupSnippet[]>([]);
  const [snippetsLoading, setSnippetsLoading] = useState(false);
  const [snippetError, setSnippetError] = useState('');
  const [snippetName, setSnippetName] = useState('');
  const [snippetTemplate, setSnippetTemplate] = useState('');
  const [editingSnippetId, setEditingSnippetId] = useState<string | null>(null);
  const [snippetPendingDelete, setSnippetPendingDelete] = useState<WriteupSnippet | null>(null);
  const [variables, setVariables] = useState({ ip: '', port: '', domain: '' });
  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineTarget, setNewMachineTarget] = useState('');
  const [newQuestion, setNewQuestion] = useState<Record<string, string>>({});
  const [newStep, setNewStep] = useState<Record<string, string>>({});
  const [savingSnippet, setSavingSnippet] = useState(false);
  const review = useMemo(() => reviewPublication({ markdown_content: markdown, assets, findings, workbench: value }), [markdown, assets, findings, value]);

  useEffect(() => {
    let active = true;
    setSnippetsLoading(true);
    setSnippetError('');
    api.listWriteupSnippets()
      .then((rows) => { if (active) setSnippets(rows); })
      .catch((error: unknown) => { if (active) setSnippetError(error instanceof Error ? error.message : 'No se pudo abrir la biblioteca.'); })
      .finally(() => { if (active) setSnippetsLoading(false); });
    return () => { active = false; };
  }, [writeup.id]);

  useEffect(() => {
    if (focusEvidenceId) setTab('evidence');
  }, [focusEvidenceId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const updateWorkbench = (next: WriteupWorkbench) => onChange(next);
  const patchEvidence = (id: string, patch: Partial<WriteupEvidenceBlock>) => updateWorkbench({
    ...value,
    evidence: value.evidence.map((item) => item.id === id ? { ...item, ...patch } : item),
  });
  const patchMachine = (id: string, patch: Partial<WriteupMachineProgress>) => updateWorkbench({
    ...value,
    machines: value.machines.map((machine) => machine.id === id ? { ...machine, ...patch } : machine),
  });
  const addEvidence = () => {
    if (value.evidence.length >= 200) return;
    updateWorkbench({ ...value, evidence: [createEvidence(), ...value.evidence] });
  };
  const addMachine = () => {
    if (!newMachineName.trim() || value.machines.length >= 100) return;
    updateWorkbench({ ...value, machines: [{ ...createMachine(), name: newMachineName.trim(), target: newMachineTarget.trim() }, ...value.machines] });
    setNewMachineName('');
    setNewMachineTarget('');
  };

  const saveSnippet = async () => {
    if (!snippetName.trim() || !snippetTemplate.trim()) return;
    setSavingSnippet(true);
    setSnippetError('');
    try {
      const saved = editingSnippetId
        ? await api.updateWriteupSnippet(editingSnippetId, { name: snippetName.trim(), template: snippetTemplate })
        : await api.createWriteupSnippet({ name: snippetName.trim(), template: snippetTemplate });
      setSnippets((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setSnippetName('');
      setSnippetTemplate('');
      setEditingSnippetId(null);
    } catch (error) {
      setSnippetError(error instanceof Error ? error.message : 'No se pudo guardar el fragmento.');
    } finally {
      setSavingSnippet(false);
    }
  };

  const insertSnippet = (snippet: WriteupSnippet) => {
    const result = interpolateSnippet(snippet.template, variables);
    if (result.error) { setSnippetError(result.error); return; }
    onInsertSnippet(result.value || '');
    setSnippetError('');
  };

  const deleteSnippet = async () => {
    const snippet = snippetPendingDelete;
    if (!snippet) return;
    try {
      await api.deleteWriteupSnippet(snippet.id);
      setSnippets((current) => current.filter((item) => item.id !== snippet.id));
      if (editingSnippetId === snippet.id) { setEditingSnippetId(null); setSnippetName(''); setSnippetTemplate(''); }
    } catch (error) {
      setSnippetError(error instanceof Error ? error.message : 'No se pudo eliminar el fragmento.');
    } finally {
      setSnippetPendingDelete(null);
    }
  };

  const tabs: Array<[WorkbenchTab, string, React.ComponentType<{ className?: string }>, number]> = [
    ['evidence', 'Evidencias', Clipboard, value.evidence.length],
    ['progress', 'Progreso', CheckCircle2, value.machines.length],
    ['snippets', 'Fragmentos', BookOpen, snippets.length],
    ['publish', 'Publicación', FileText, 0],
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/75 p-2 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="writeup-workbench-title" className="my-auto flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <h2 id="writeup-workbench-title" className="truncate text-base font-semibold text-white">Laboratorio del informe</h2>
            <p className="truncate text-xs text-slate-400">{writeup.title} · evidencias, progreso y recursos reutilizables</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar laboratorio" className={iconButtonClass}><X className="h-4 w-4" /></button>
        </header>

        <nav aria-label="Secciones del laboratorio" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 px-3 py-2">
          {tabs.map(([id, label, Icon, count]) => <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs ${tab === id ? 'bg-emerald-800 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><Icon className="h-4 w-4" />{label}{count > 0 && <span className="font-mono text-[10px] opacity-70">{count}</span>}</button>)}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {tab === 'evidence' && <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-white">Bloques de evidencia</h3><p className="mt-0.5 text-xs text-slate-400">Guarda el contexto reproducible junto con cada salida o captura.</p></div><button type="button" disabled={readOnly || value.evidence.length >= 200} onClick={addEvidence} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-40"><Plus className="h-4 w-4" />Añadir evidencia</button></div>
            {value.evidence.length === 0 && <p className={panelClass + ' text-sm text-slate-400'}>Todavía no hay bloques. Cada uno puede guardar objetivo, fecha, comando, resultado, capturas y hallazgos relacionados.</p>}
            {value.evidence.map((item, index) => <article id={`workbench-evidence-${item.id}`} key={item.id} className={`${panelClass} space-y-3 ${focusEvidenceId === item.id ? 'border-emerald-600' : ''}`}>
              <div className="flex items-start gap-2"><span className="mt-2 font-mono text-[10px] text-slate-500">E{String(index + 1).padStart(2, '0')}</span><div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-1 block text-[11px] text-slate-400">Título</span><input disabled={readOnly} className={fieldClass} maxLength={200} value={item.title} placeholder="Enumeración de puertos" onChange={(event) => patchEvidence(item.id, { title: event.target.value })} /></label><label><span className="mb-1 block text-[11px] text-slate-400">Objetivo</span><input disabled={readOnly} className={fieldClass} maxLength={255} value={item.target} placeholder="IP, dominio o máquina" onChange={(event) => patchEvidence(item.id, { target: event.target.value })} /></label><label><span className="mb-1 block text-[11px] text-slate-400">Fecha y hora</span><input disabled={readOnly} type="datetime-local" className={fieldClass} value={toLocalDateTimeInput(item.captured_at)} onChange={(event) => patchEvidence(item.id, { captured_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label><label><span className="mb-1 block text-[11px] text-slate-400">Comando</span><textarea disabled={readOnly} className={`${fieldClass} min-h-20 font-mono`} maxLength={6000} value={item.command} placeholder="nmap -sV {{ip}}" onChange={(event) => patchEvidence(item.id, { command: event.target.value })} /></label><label><span className="mb-1 block text-[11px] text-slate-400">Resultado</span><textarea disabled={readOnly} className={`${fieldClass} min-h-20 font-mono`} maxLength={20000} value={item.result} placeholder="Puertos y servicios encontrados" onChange={(event) => patchEvidence(item.id, { result: event.target.value })} /></label></div><button type="button" disabled={readOnly} onClick={() => updateWorkbench({ ...value, evidence: value.evidence.filter((evidence) => evidence.id !== item.id) })} aria-label="Eliminar evidencia" title="Eliminar evidencia" className={iconButtonClass}><Trash2 className="h-4 w-4" /></button></div>
              <div className="grid grid-cols-1 gap-3 border-t border-slate-800 pt-3 sm:grid-cols-2">
                <fieldset disabled={readOnly} className="space-y-1.5"><legend className="mb-1 text-[11px] font-medium text-slate-300">Censurar en exportación para cliente</legend>{([['redact_target', 'Objetivo'], ['redact_command', 'Comando'], ['redact_result', 'Resultado']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={item[key]} onChange={(event) => patchEvidence(item.id, { [key]: event.target.checked })} />{label}</label>)}</fieldset>
                <div className="space-y-1.5"><span className="text-[11px] font-medium text-slate-300">Capturas asociadas</span>{assets.length ? <div className="max-h-28 space-y-1 overflow-y-auto">{assets.map((asset) => <label key={asset.id} className="flex min-w-0 items-center gap-2 text-xs text-slate-400"><input disabled={readOnly} type="checkbox" checked={item.asset_ids.includes(asset.id)} onChange={(event) => patchEvidence(item.id, { asset_ids: event.target.checked ? [...new Set([...item.asset_ids, asset.id])] : item.asset_ids.filter((id) => id !== asset.id) })} /><span className="min-w-0 flex-1 truncate">{asset.caption || asset.filename}</span><button type="button" onClick={() => onInspectAsset(asset)} className="shrink-0 text-emerald-300 hover:underline">Ver</button></label>)}</div> : <p className="text-xs text-slate-500">Sube capturas desde el informe para enlazarlas.</p>}</div>
              </div>
              <div className="border-t border-slate-800 pt-3"><span className="mb-1.5 block text-[11px] font-medium text-slate-300">Hallazgos relacionados</span>{findings.length ? <div className="flex flex-wrap gap-1.5">{findings.map((finding) => <label key={finding.id} className="inline-flex min-h-8 items-center gap-1.5 rounded border border-slate-800 px-2 text-xs text-slate-300"><input disabled={readOnly} type="checkbox" checked={item.finding_ids.includes(finding.id)} onChange={(event) => patchEvidence(item.id, { finding_ids: event.target.checked ? [...new Set([...item.finding_ids, finding.id])] : item.finding_ids.filter((id) => id !== finding.id) })} />{finding.id} · {finding.title}</label>)}</div> : <p className="text-xs text-slate-500">Crea hallazgos estructurados para poder vincularlos.</p>}{item.finding_ids.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{item.finding_ids.map((id) => <button key={id} type="button" onClick={() => onNavigateFinding(id)} className="inline-flex min-h-8 items-center gap-1 text-xs text-emerald-300 hover:underline">Abrir {findings.find((finding) => finding.id === id)?.id || id}<ArrowUpRight className="h-3 w-3" /></button>)}</div>}</div>
            </article>)}
          </div>}

          {tab === 'progress' && <div className="space-y-3">
            <div><h3 className="text-sm font-semibold text-white">Seguimiento por máquina</h3><p className="mt-0.5 text-xs text-slate-400">Mantén preguntas, respuestas y próximos pasos junto a su objetivo.</p></div>
            <form onSubmit={(event) => { event.preventDefault(); addMachine(); }} className={`${panelClass} grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]`}><input disabled={readOnly} className={fieldClass} maxLength={120} value={newMachineName} onChange={(event) => setNewMachineName(event.target.value)} placeholder="Nombre de máquina o reto" /><input disabled={readOnly} className={fieldClass} maxLength={255} value={newMachineTarget} onChange={(event) => setNewMachineTarget(event.target.value)} placeholder="IP o dominio" /><button type="submit" disabled={readOnly || !newMachineName.trim() || value.machines.length >= 100} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md bg-emerald-700 px-3 text-xs text-white disabled:opacity-40"><Plus className="h-4 w-4" />Añadir</button></form>
            {value.machines.map((machine) => <article key={machine.id} className={`${panelClass} space-y-3`}><div className="flex flex-wrap items-center gap-2"><input disabled={readOnly} className={`${fieldClass} min-w-[150px] flex-1`} maxLength={120} value={machine.name} onChange={(event) => patchMachine(machine.id, { name: event.target.value })} /><input disabled={readOnly} className={`${fieldClass} min-w-[150px] flex-1`} maxLength={255} value={machine.target} placeholder="Objetivo" onChange={(event) => patchMachine(machine.id, { target: event.target.value })} /><select disabled={readOnly} aria-label={`Estado de ${machine.name}`} value={machine.status} onChange={(event) => patchMachine(machine.id, { status: event.target.value as WriteupMachineProgress['status'] })} className="min-h-9 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200"><option value="pendiente">Pendiente</option><option value="en_progreso">En progreso</option><option value="completada">Completada</option></select><button type="button" disabled={readOnly} onClick={() => updateWorkbench({ ...value, machines: value.machines.filter((item) => item.id !== machine.id) })} aria-label={`Eliminar ${machine.name}`} className={iconButtonClass}><Trash2 className="h-4 w-4" /></button></div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <section className="space-y-2"><h4 className="text-xs font-medium text-slate-300">Preguntas y respuestas</h4>{machine.questions.map((question) => <div key={question.id} className="rounded-md border border-slate-800 p-2"><div className="flex items-start gap-2"><textarea disabled={readOnly} className={`${fieldClass} min-h-14`} maxLength={2000} value={question.question} onChange={(event) => patchMachine(machine.id, { questions: machine.questions.map((item) => item.id === question.id ? { ...item, question: event.target.value } : item) })} /><button type="button" disabled={readOnly} onClick={() => patchMachine(machine.id, { questions: machine.questions.filter((item) => item.id !== question.id) })} aria-label="Eliminar pregunta" className={iconButtonClass}><X className="h-4 w-4" /></button></div><textarea disabled={readOnly} className={`${fieldClass} mt-2 min-h-14`} maxLength={6000} value={question.answer} placeholder="Respuesta" onChange={(event) => patchMachine(machine.id, { questions: machine.questions.map((item) => item.id === question.id ? { ...item, answer: event.target.value, status: event.target.value.trim() ? 'respondida' : 'pendiente' } : item) })} /></div>)}<div className="flex gap-2"><input disabled={readOnly} className={fieldClass} maxLength={2000} value={newQuestion[machine.id] || ''} onChange={(event) => setNewQuestion((current) => ({ ...current, [machine.id]: event.target.value }))} placeholder="Agregar pregunta" /><button type="button" disabled={readOnly || !newQuestion[machine.id]?.trim() || machine.questions.length >= 100} onClick={() => { patchMachine(machine.id, { questions: [...machine.questions, { id: createWorkbenchId('question'), question: newQuestion[machine.id].trim(), answer: '', status: 'pendiente' }] }); setNewQuestion((current) => ({ ...current, [machine.id]: '' })); }} className={iconButtonClass} aria-label="Añadir pregunta"><Plus className="h-4 w-4" /></button></div></section>
                <section className="space-y-2"><h4 className="text-xs font-medium text-slate-300">Pasos pendientes</h4>{machine.steps.map((step) => <div key={step.id} className="flex items-center gap-2 rounded-md border border-slate-800 px-2 py-1.5"><input disabled={readOnly} type="checkbox" checked={step.status === 'completado'} onChange={(event) => patchMachine(machine.id, { steps: machine.steps.map((item) => item.id === step.id ? { ...item, status: event.target.checked ? 'completado' : 'pendiente' } : item) })} /><input disabled={readOnly} className="min-w-0 flex-1 bg-transparent text-xs text-slate-300 outline-none" maxLength={2000} value={step.text} onChange={(event) => patchMachine(machine.id, { steps: machine.steps.map((item) => item.id === step.id ? { ...item, text: event.target.value } : item) })} /><button type="button" disabled={readOnly} onClick={() => patchMachine(machine.id, { steps: machine.steps.filter((item) => item.id !== step.id) })} aria-label="Eliminar paso" className={iconButtonClass}><X className="h-4 w-4" /></button></div>)}<div className="flex gap-2"><input disabled={readOnly} className={fieldClass} maxLength={2000} value={newStep[machine.id] || ''} onChange={(event) => setNewStep((current) => ({ ...current, [machine.id]: event.target.value }))} placeholder="Agregar paso" /><button type="button" disabled={readOnly || !newStep[machine.id]?.trim() || machine.steps.length >= 200} onClick={() => { patchMachine(machine.id, { steps: [...machine.steps, { id: createWorkbenchId('step'), text: newStep[machine.id].trim(), status: 'pendiente' }] }); setNewStep((current) => ({ ...current, [machine.id]: '' })); }} className={iconButtonClass} aria-label="Añadir paso"><Plus className="h-4 w-4" /></button></div></section>
              </div>
            </article>)}
          </div>}

          {tab === 'snippets' && <div className="space-y-3">
            <div><h3 className="text-sm font-semibold text-white">Biblioteca compartida de fragmentos</h3><p className="mt-0.5 text-xs text-slate-400">Se guarda cifrada en la bóveda para usarla en cualquiera de tus equipos. Las variables se validan antes de insertarse.</p></div>
            <div className={`${panelClass} grid grid-cols-1 gap-2 sm:grid-cols-3`}><label><span className="mb-1 block text-[11px] text-slate-400">IP</span><input className={fieldClass} maxLength={64} value={variables.ip} onChange={(event) => setVariables((current) => ({ ...current, ip: event.target.value }))} placeholder="10.10.10.5" /></label><label><span className="mb-1 block text-[11px] text-slate-400">Puerto</span><input className={fieldClass} inputMode="numeric" maxLength={5} value={variables.port} onChange={(event) => setVariables((current) => ({ ...current, port: event.target.value }))} placeholder="443" /></label><label><span className="mb-1 block text-[11px] text-slate-400">Dominio</span><input className={fieldClass} maxLength={253} value={variables.domain} onChange={(event) => setVariables((current) => ({ ...current, domain: event.target.value }))} placeholder="objetivo.local" /></label></div>
            {snippetError && <p role="alert" className="rounded-md border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">{snippetError}</p>}
            <div className={`${panelClass} space-y-2`}><div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold text-slate-200">{editingSnippetId ? 'Editar fragmento' : 'Nuevo fragmento'}</h4>{editingSnippetId && <button type="button" onClick={() => { setEditingSnippetId(null); setSnippetName(''); setSnippetTemplate(''); }} className="text-xs text-slate-400 hover:text-white">Cancelar</button>}</div><input disabled={readOnly} className={fieldClass} maxLength={120} value={snippetName} onChange={(event) => setSnippetName(event.target.value)} placeholder="Nombre, por ejemplo: Enumeración rápida" /><textarea disabled={readOnly} className={`${fieldClass} min-h-24 font-mono`} maxLength={12000} value={snippetTemplate} onChange={(event) => setSnippetTemplate(event.target.value)} placeholder="nmap -sV -p {{puerto}} {{ip}}\n" /><p className="text-[11px] text-slate-500">Variables: {'{{ip}}'}, {'{{puerto}}'}, {'{{dominio}}'} (también acepta objetivo, port y domain).</p><button type="button" disabled={readOnly || savingSnippet || !snippetName.trim() || !snippetTemplate.trim()} onClick={() => void saveSnippet()} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-slate-800 px-3 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"><Save className="h-3.5 w-3.5" />{savingSnippet ? 'Guardando…' : editingSnippetId ? 'Guardar cambios' : 'Guardar en biblioteca'}</button></div>
            {snippetsLoading ? <p className="text-xs text-slate-400">Cargando biblioteca…</p> : snippets.length === 0 ? <p className={`${panelClass} text-sm text-slate-400`}>La biblioteca todavía está vacía.</p> : <div className="space-y-2">{snippets.map((snippet) => <article key={snippet.id} className={`${panelClass} flex flex-wrap items-center gap-2`}><div className="min-w-0 flex-1"><h4 className="truncate text-sm font-medium text-slate-200">{snippet.name}</h4><pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-slate-400">{snippet.template}</pre></div><button type="button" disabled={readOnly} onClick={() => insertSnippet(snippet)} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-emerald-300 hover:bg-slate-800 disabled:opacity-40"><Clipboard className="h-3.5 w-3.5" />Insertar</button><button type="button" disabled={readOnly} onClick={() => { setEditingSnippetId(snippet.id); setSnippetName(snippet.name); setSnippetTemplate(snippet.template); }} aria-label={`Editar ${snippet.name}`} className={iconButtonClass}><Save className="h-4 w-4" /></button><button type="button" disabled={readOnly} onClick={() => setSnippetPendingDelete(snippet)} aria-label={`Eliminar ${snippet.name}`} className={iconButtonClass}><Trash2 className="h-4 w-4" /></button></article>)}</div>}
            {snippetError && <p role="alert" className="text-xs text-rose-300">{snippetError}</p>}
          </div>}

          {tab === 'publish' && <div className="space-y-3">
            <div><h3 className="text-sm font-semibold text-white">Revisión de publicación</h3><p className="mt-0.5 text-xs text-slate-400">Comprobaciones orientativas sobre el contenido actual. Se ejecutan antes de compartir o exportar.</p></div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{[
              ['Imágenes ausentes', review.missingImages], ['Enlaces vacíos', review.emptyLinks], ['Secciones vacías', review.emptySections],
              ['Posibles secretos sin marcador', review.possibleSecrets], ['Campos de evidencia censurados', review.redactedFields],
              ['Preguntas pendientes', review.pendingQuestions], ['Pasos pendientes', review.pendingSteps],
            ].map(([label, count]) => <div key={label} className={`${panelClass} flex items-center justify-between gap-3`}><span className="text-xs text-slate-300">{label}</span><span className={`font-mono text-sm tabular-nums ${Number(count) > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{count}</span></div>)}</div>
            {review.possibleSecrets > 0 && <p className="flex items-start gap-2 rounded-md border border-amber-900/70 bg-amber-950/20 p-3 text-xs text-amber-100"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />La detección es heurística y puede tener falsos positivos. Confirma los hallazgos manualmente y marca campos sensibles para que la exportación de cliente los censure.</p>}
            <p className="text-xs text-slate-500">Revisé el informe, sus adjuntos y las evidencias registradas. Las opciones seleccionadas en Exportar determinan qué contenido se incluye y si se aplica la censura.</p>
          </div>}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-2.5 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" />Los cambios del informe se guardan con el botón Guardar o el autoguardado</span><button type="button" onClick={onClose} className="min-h-9 rounded-md px-3 text-xs text-slate-300 hover:bg-slate-800">Cerrar</button></footer>
      </section>
      <ConfirmDialog
        open={Boolean(snippetPendingDelete)}
        title="Eliminar fragmento"
        message={snippetPendingDelete ? `¿Eliminar «${snippetPendingDelete.name}» de la biblioteca compartida? Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        tone="danger"
        onCancel={() => setSnippetPendingDelete(null)}
        onConfirm={() => void deleteSnippet()}
      />
    </div>
  );
};
